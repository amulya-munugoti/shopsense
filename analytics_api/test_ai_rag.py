import os
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import httpx
from jose import jwt

from analytics_api import ai_rag, main


def make_catalog():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.executescript(
        """
        CREATE TABLE vendors (id INTEGER PRIMARY KEY, business_name TEXT NOT NULL);
        CREATE TABLE products (
            id INTEGER PRIMARY KEY, vendor_id INTEGER NOT NULL, name TEXT NOT NULL,
            description TEXT, category TEXT NOT NULL, price REAL NOT NULL,
            stock INTEGER NOT NULL, image_url TEXT
        );
        CREATE TABLE sales (
            id INTEGER PRIMARY KEY, vendor_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL
        );
        INSERT INTO vendors VALUES (1, 'Vendor One'), (2, 'Vendor Two');
        INSERT INTO products VALUES
            (1, 1, 'Flex Yoga Mat', 'Comfortable mat for stretching and yoga workouts.', 'Sports', 1199, 9, ''),
            (2, 1, 'Neoprene Dumbbell Pair', 'Dumbbells for strength workouts.', 'Sports', 1799, 0, ''),
            (3, 1, 'Smart Fitness Band', 'Activity tracking for daily workouts.', 'Electronics', 1999, 3, ''),
            (4, 1, 'Everyday Laptop Backpack', 'A backpack for carrying a laptop.', 'Accessories', 2199, 8, ''),
            (5, 2, 'Yoga Starter Mat', 'Yoga mat for exercise.', 'Sports', 499, 5, '');
        INSERT INTO sales VALUES (1, 1, 1, 12), (2, 1, 2, 4);
        """
    )
    return connection


class RetrievalTests(unittest.TestCase):
    def setUp(self):
        self.db = make_catalog()

    def tearDown(self):
        self.db.close()

    def test_fitness_search_is_relevant_and_vendor_scoped(self):
        result = ai_rag.retrieve_products(self.db, "What fitness products do you have?", 1)
        names = {product["name"] for product in result["products"]}

        self.assertIn("Flex Yoga Mat", names)
        self.assertIn("Neoprene Dumbbell Pair", names)
        self.assertIn("Smart Fitness Band", names)
        self.assertNotIn("Everyday Laptop Backpack", names)
        self.assertNotIn("Yoga Starter Mat", names)
        self.assertEqual(result["totalMatched"], 3)

    def test_price_category_and_stock_filters_are_hard_constraints(self):
        result = ai_rag.retrieve_products(
            self.db, "Show Sports products under ₹1,500 that are in stock", 1
        )

        self.assertEqual([product["name"] for product in result["products"]], ["Flex Yoga Mat"])
        self.assertEqual(result["totalMatched"], 1)
        self.assertEqual(result["products"][0]["vendorId"], 1)

    def test_price_range_and_out_of_stock_constraints(self):
        result = ai_rag.retrieve_products(
            self.db, "Show out-of-stock products between ₹1,500 and ₹2,000", 1
        )

        self.assertEqual([product["name"] for product in result["products"]], ["Neoprene Dumbbell Pair"])

    def test_laptop_query_does_not_match_a_laptop_backpack(self):
        result = ai_rag.retrieve_products(self.db, "Do you have a laptop?", 1)

        self.assertEqual(result["products"], [])

    def test_computer_category_does_not_include_a_laptop_backpack(self):
        result = ai_rag.retrieve_products(self.db, "Show computer products", 1)

        self.assertNotIn("Everyday Laptop Backpack", [product["name"] for product in result["products"]])

    def test_ranking_uses_catalog_values(self):
        result = ai_rag.retrieve_products(self.db, "Which is the most expensive product?", 1)

        self.assertEqual(result["products"][0]["name"], "Everyday Laptop Backpack")

    def test_expensive_product_returns_only_the_highest_priced_match(self):
        result = ai_rag.retrieve_products(self.db, "I need an expensive product", 1)

        self.assertEqual(len(result["products"]), 1)
        self.assertEqual(result["products"][0]["name"], "Everyday Laptop Backpack")

    def test_explicit_single_result_limit_overrides_default_multi_match(self):
        result = ai_rag.retrieve_products(
            self.db,
            "Show me an expensive product, only 1",
            1,
        )

        self.assertEqual(len(result["products"]), 1)
        self.assertEqual(result["products"][0]["name"], "Everyday Laptop Backpack")
        self.assertEqual(result["constraints"]["result_limit"], 1)

    def test_counts_are_exact_for_price_filter(self):
        result = ai_rag.retrieve_products(self.db, "How many products are under Rs 1500?", 1)

        self.assertEqual(result["totalMatched"], 1)
        self.assertEqual(result["totalUnits"], 9)
        self.assertEqual(result["products"], [])

    def test_everyday_yoga_request_applies_topic_and_budget_together(self):
        result = ai_rag.retrieve_products(
            self.db,
            "I'm looking for a mat I can use for yoga, ideally under 1.5k",
            1,
        )

        self.assertEqual([product["name"] for product in result["products"]], ["Flex Yoga Mat"])
        self.assertEqual(result["constraints"]["maximum_price"], 1500)

    def test_everyday_bag_request_matches_a_laptop_backpack(self):
        result = ai_rag.retrieve_products(
            self.db,
            "I need a bag to carry my laptop",
            1,
        )

        self.assertEqual(
            [product["name"] for product in result["products"]],
            ["Everyday Laptop Backpack"],
        )

    def test_colloquial_restock_question_finds_low_stock_products(self):
        result = ai_rag.retrieve_products(
            self.db,
            "What do I need to restock?",
            1,
        )

        self.assertEqual(
            {product["name"] for product in result["products"]},
            {"Smart Fitness Band", "Neoprene Dumbbell Pair"},
        )

    def test_negated_out_of_stock_filter_means_available_products(self):
        result = ai_rag.retrieve_products(
            self.db,
            "Show me products that are not out of stock",
            1,
        )

        self.assertEqual(result["constraints"]["stock"], "in")
        self.assertTrue(result["products"])
        self.assertTrue(all(product["stock"] > 0 for product in result["products"]))

    def test_natural_buy_question_finds_available_products(self):
        result = ai_rag.retrieve_products(
            self.db,
            "Which products can I actually buy now?",
            1,
        )

        self.assertEqual(result["constraints"]["stock"], "in")
        self.assertTrue(result["products"])
        self.assertTrue(all(product["stock"] > 0 for product in result["products"]))

    def test_universal_stock_question_reports_products_out_of_stock(self):
        question = "is every product stock is full?"
        result = ai_rag.retrieve_products(self.db, question, 1)
        answer = ai_rag.format_grounded_answer(question, result)

        self.assertEqual(result["constraints"]["stock_check"], "in")
        self.assertEqual(result["totalMatched"], 4)
        self.assertIn("No—**1 of 4 products** are out of stock", answer)
        self.assertIn("Neoprene Dumbbell Pair", answer)
        self.assertIn("The other 3 have stock available", answer)

    def test_universal_in_stock_question_explains_stock_capacity_is_unknown(self):
        self.db.execute("UPDATE products SET stock = 1 WHERE vendor_id = 1")
        question = "Are all products in stock?"
        result = ai_rag.retrieve_products(self.db, question, 1)
        answer = ai_rag.format_grounded_answer(question, result)

        self.assertIn("Yes—all **4 products** currently have at least one unit in stock", answer)
        self.assertIn("not a maximum or target stock level", answer)

    def test_missing_specific_product_gets_direct_catalog_lookup_answer(self):
        self.db.executemany(
            "INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (6, 1, "Daily Glow Skincare Set", "Skincare.", "Beauty", 1499, 2, ""),
                (7, 1, "Soft Makeup Brush Set", "Brush set.", "Beauty", 899, 16, ""),
                (8, 1, "Ionic Hair Dryer", "Hair dryer.", "Beauty", 2499, 50, ""),
            ],
        )
        question = "is lipstick there in the catalog"
        result = ai_rag.retrieve_products(self.db, question, 1)
        answer = ai_rag.format_grounded_answer(question, result)

        self.assertEqual(result["constraints"]["catalog_lookup_terms"], ["lipstick"])
        self.assertEqual(result["products"], [])
        self.assertIn("couldn't find a **lipstick** product", answer)
        self.assertIn("3 product(s) in the **Beauty** category", answer)
        self.assertNotIn("Soft Makeup Brush Set", answer)

    def test_ungrammatical_does_available_lookup_bypasses_provider(self):
        self.db.executemany(
            "INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (6, 1, "Daily Glow Skincare Set", "Skincare.", "Beauty", 1499, 2, ""),
                (7, 1, "Soft Makeup Brush Set", "Brush set.", "Beauty", 899, 16, ""),
                (8, 1, "Ionic Hair Dryer", "Hair dryer.", "Beauty", 2499, 50, ""),
            ],
        )
        question = "Does mascara available?"
        result = ai_rag.retrieve_products(self.db, question, 1)
        answer = ai_rag.format_grounded_answer(question, result)

        self.assertEqual(result["constraints"]["catalog_lookup_terms"], ["mascara"])
        self.assertEqual(result["products"], [])
        self.assertIn("couldn't find a **mascara** product", answer)
        self.assertIn("3 product(s) in the **Beauty** category", answer)

    def test_product_lookup_finds_a_listed_product_by_name(self):
        self.db.execute(
            "INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (6, 1, "Velvet Lipstick", "Long-wear lipstick.", "Beauty", 599, 7, ""),
        )
        question = "Do you have lipstick in the catalog?"
        result = ai_rag.retrieve_products(self.db, question, 1)
        answer = ai_rag.format_grounded_answer(question, result)

        self.assertEqual([product["name"] for product in result["products"]], ["Velvet Lipstick"])
        self.assertIn("Yes, your catalog lists **Velvet Lipstick** (7 in stock)", answer)


class PythonGenerationTests(unittest.IsolatedAsyncioTestCase):
    async def test_configured_gemini_receives_retrieved_catalog_context(self):
        db = make_catalog()
        results = ai_rag.retrieve_products(db, "Show fitness products", 1)
        requests = []

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"candidates": [{"content": {"parts": [{"text": "Here are your fitness products."}]}}]}

        class FakeClient:
            def __init__(self, timeout):
                self.timeout = timeout

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, url, **kwargs):
                requests.append((url, kwargs))
                return FakeResponse()

        try:
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key", "OPENAI_API_KEY": ""}):
                with patch("analytics_api.ai_rag.httpx.AsyncClient", FakeClient):
                    answer, provider = await ai_rag.generate_answer("Show fitness products", results)

            self.assertEqual(answer, "Here are your fitness products.")
            self.assertEqual(provider, "Gemini + Python RAG")
            self.assertIn("gemini-3.8-flash:generateContent", requests[0][0])
            prompt = requests[0][1]["json"]["contents"][0]["parts"][0]["text"]
            self.assertIn("Flex Yoga Mat", prompt)
        finally:
            db.close()

    async def test_general_question_uses_full_vendor_catalog_even_without_retrieval_hits(self):
        db = make_catalog()
        results = ai_rag.retrieve_products(db, "Can you summarize my product range?", 1)
        requests = []

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"choices": [{"message": {"content": "Your catalog covers sports, electronics, and accessories."}}]}

        class FakeClient:
            def __init__(self, timeout):
                self.timeout = timeout

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, url, **kwargs):
                requests.append((url, kwargs))
                return FakeResponse()

        try:
            with patch.dict(os.environ, {"GEMINI_API_KEY": "", "OPENAI_API_KEY": "test-openai-key"}):
                with patch("analytics_api.ai_rag.httpx.AsyncClient", FakeClient):
                    answer, provider = await ai_rag.generate_answer(
                        "Can you summarize my product range?", results
                    )

            self.assertEqual(results["products"], [])
            self.assertEqual(answer, "Your catalog covers sports, electronics, and accessories.")
            self.assertEqual(provider, "OpenAI + Python RAG")
            prompt = requests[0][1]["json"]["messages"][1]["content"]
            self.assertIn("Flex Yoga Mat", prompt)
            self.assertIn("Everyday Laptop Backpack", prompt)
            self.assertNotIn("Yoga Starter Mat", prompt)
            self.assertIn('"complete": true', prompt)
        finally:
            db.close()

    async def test_unavailable_provider_does_not_claim_unknown_question_has_no_match(self):
        db = make_catalog()
        results = ai_rag.retrieve_products(db, "What is my business's customer satisfaction?", 1)
        try:
            with patch.dict(os.environ, {"GEMINI_API_KEY": "", "OPENAI_API_KEY": "", "LLM_API_KEY": ""}):
                answer, provider = await ai_rag.generate_answer(
                    "What is my business's customer satisfaction?", results
                )

            self.assertIn("can’t verify an answer", answer)
            self.assertEqual(provider, "Python Grounded Catalog RAG (Local)")
        finally:
            db.close()

    async def test_configured_but_unavailable_provider_is_reported_to_user(self):
        db = make_catalog()
        question = "Can you summarize my product range?"
        results = ai_rag.retrieve_products(db, question, 1)
        try:
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key", "OPENAI_API_KEY": ""}):
                with patch(
                    "analytics_api.ai_rag._generate_text",
                    return_value=(None, None),
                ):
                    answer, provider = await ai_rag.generate_answer(question, results)

            self.assertIn("AI answer generation is unavailable", answer)
            self.assertEqual(provider, "Python Grounded Catalog RAG (Provider unavailable)")
        finally:
            db.close()

    async def test_general_question_uses_full_vendor_catalog_even_without_retrieval_hits(self):
        db = make_catalog()
        results = ai_rag.retrieve_products(db, "Can you summarize my product range?", 1)
        requests = []

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"choices": [{"message": {"content": "Your catalog covers sports, electronics, and accessories."}}]}

        class FakeClient:
            def __init__(self, timeout):
                self.timeout = timeout

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, url, **kwargs):
                requests.append((url, kwargs))
                return FakeResponse()

        try:
            with patch.dict(os.environ, {"GEMINI_API_KEY": "", "OPENAI_API_KEY": "test-openai-key"}):
                with patch("analytics_api.ai_rag.httpx.AsyncClient", FakeClient):
                    answer, provider = await ai_rag.generate_answer(
                        "Can you summarize my product range?", results
                    )

            self.assertEqual(results["products"], [])
            self.assertEqual(answer, "Your catalog covers sports, electronics, and accessories.")
            self.assertEqual(provider, "OpenAI + Python RAG")
            prompt = requests[0][1]["json"]["messages"][1]["content"]
            self.assertIn("Flex Yoga Mat", prompt)
            self.assertIn("Everyday Laptop Backpack", prompt)
            self.assertNotIn("Yoga Starter Mat", prompt)
            self.assertIn('"complete": true', prompt)
        finally:
            db.close()

    async def test_unavailable_provider_does_not_claim_unknown_question_has_no_match(self):
        db = make_catalog()
        question = "What is my business's customer satisfaction?"
        results = ai_rag.retrieve_products(db, question, 1)
        try:
            with patch.dict(os.environ, {"GEMINI_API_KEY": "", "OPENAI_API_KEY": "", "LLM_API_KEY": ""}):
                answer, provider = await ai_rag.generate_answer(question, results)

            self.assertIn("can’t verify an answer", answer)
            self.assertEqual(provider, "Python Grounded Catalog RAG (Local)")
        finally:
            db.close()

    async def test_gemini_failure_falls_back_to_openai(self):
        db = make_catalog()
        results = ai_rag.retrieve_products(db, "Show fitness products", 1)
        request_urls = []

        class FakeClient:
            def __init__(self, timeout):
                self.timeout = timeout

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, url, **_kwargs):
                request_urls.append(url)
                if "generativelanguage.googleapis.com" in url:
                    request = httpx.Request("POST", url)
                    response = httpx.Response(503, request=request)
                    response.raise_for_status()
                return type(
                    "FakeResponse",
                    (),
                    {
                        "raise_for_status": lambda self: None,
                        "json": lambda self: {
                            "choices": [{"message": {"content": "OpenAI grounded answer."}}]
                        },
                    },
                )()

        try:
            with patch.dict(
                os.environ,
                {
                    "GEMINI_API_KEY": "test-gemini-key",
                    "OPENAI_API_KEY": "test-openai-key",
                    "LLM_API_KEY": "",
                },
            ):
                with patch("analytics_api.ai_rag.httpx.AsyncClient", FakeClient):
                    answer, provider = await ai_rag.generate_answer(
                        "Show fitness products", results
                    )

            self.assertEqual(answer, "OpenAI grounded answer.")
            self.assertEqual(provider, "OpenAI + Python RAG")
            self.assertEqual(len(request_urls), 2)
            self.assertIn("gemini", request_urls[0])
            self.assertIn("openai", request_urls[1])
        finally:
            db.close()

    async def test_grounded_description_and_seo_fields_work_without_a_provider(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "", "OPENAI_API_KEY": "", "LLM_API_KEY": ""}):
            description = await ai_rag.generate_product_description(
                "Flex Yoga Mat", "Sports", "Comfortable surface for yoga."
            )
            seo = await ai_rag.generate_seo_content(
                "Flex Yoga Mat", "Sports", "Comfortable surface for yoga."
            )

        self.assertEqual(description["provider"], "Local (grounded)")
        self.assertIn("Flex Yoga Mat", description["description"])
        self.assertEqual(seo["provider"], "Local")
        self.assertEqual(
            set(seo) - {"provider"},
            {
                "seoTitle", "description", "shortDescription", "metaTitle",
                "metaDescription", "seoKeywords", "productTags", "keyFeatures",
            },
        )
        self.assertTrue(all(seo[key] for key in (
            "seoTitle", "description", "shortDescription", "metaTitle",
            "metaDescription", "seoKeywords", "productTags", "keyFeatures",
        )))


class PythonAiEndpointTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_directory.name) / "shopsense.db"
        connection = make_catalog()
        disk_connection = sqlite3.connect(self.db_path)
        connection.backup(disk_connection)
        disk_connection.close()
        connection.close()
    def tearDown(self):
        self.temp_directory.cleanup()

    def _token(self, user_id, role):
        return jwt.encode(
            {
                "id": user_id,
                "role": role,
                "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
            },
            main.JWT_SECRET,
            algorithm="HS256",
        )

    async def test_vendor_token_controls_catalog_scope_and_response_shape(self):
        headers = {"Authorization": "Bearer " + self._token(1, "vendor")}
        body = {
            "question": "Show my products",
            "vendorId": 2,
            "conversationHistory": [],
        }
        with patch.object(main, "DB_PATH", self.db_path), patch.dict(
            os.environ, {"GEMINI_API_KEY": "", "OPENAI_API_KEY": "", "LLM_API_KEY": ""}
        ):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=main.app),
                base_url="http://test",
            ) as client:
                response = await client.post("/ai/shopping-assistant", headers=headers, json=body)

        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(set(result), {"answer", "products", "sources"})
        self.assertTrue(result["products"])
        self.assertTrue(all(product["vendorId"] == 1 for product in result["products"]))
        self.assertNotIn("Yoga Starter Mat", [product["name"] for product in result["products"]])

    async def test_inventory_summary_does_not_attach_unrelated_product_cards(self):
        headers = {"Authorization": "Bearer " + self._token(1, "vendor")}
        with patch.object(main, "DB_PATH", self.db_path), patch.dict(
            os.environ, {"GEMINI_API_KEY": "", "OPENAI_API_KEY": "", "LLM_API_KEY": ""}
        ):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=main.app),
                base_url="http://test",
            ) as client:
                response = await client.post(
                    "/ai/shopping-assistant",
                    headers=headers,
                    json={"question": "is every product stock is full?"},
                )

        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertIn("1 of 4 products", result["answer"])
        self.assertEqual(result["products"], [])
        self.assertEqual(result["sources"], [])

    async def test_admin_must_select_a_vendor(self):
        headers = {"Authorization": f"Bearer {self._token(5, 'admin')}"}
        with patch.object(main, "DB_PATH", self.db_path):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=main.app),
                base_url="http://test",
            ) as client:
                response = await client.post(
                    "/ai/shopping-assistant",
                    headers=headers,
                    json={"question": "Show products"},
                )

        self.assertEqual(response.status_code, 400)

    async def test_python_seo_endpoint_validates_auth_and_returns_expected_fields(self):
        headers = {"Authorization": "Bearer " + self._token(1, "vendor")}
        with patch.dict(os.environ, {"GEMINI_API_KEY": "", "OPENAI_API_KEY": "", "LLM_API_KEY": ""}):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=main.app),
                base_url="http://test",
            ) as client:
                response = await client.post(
                    "/ai/generate-seo-content",
                    headers=headers,
                    json={"name": "Flex Yoga Mat", "category": "Sports"},
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"], "Local")
        self.assertIn("seoKeywords", response.json())


if __name__ == "__main__":
    unittest.main()
