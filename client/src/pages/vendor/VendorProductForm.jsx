import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ImageUp, Sparkles, Loader2, AlertCircle, Package, DollarSign, Image as ImageIcon } from "lucide-react";
import api from "../../lib/api";
import ProductImage from "../../components/ProductImage";

const CATEGORIES = ["Accessories", "Audio", "Computers", "Electronics", "Wearables", "Clothing", "Home & Garden", "Beauty", "Sports", "Groceries", "Other"];

async function createProductImageData(file) {
  const imageUrl = URL.createObjectURL(file);
  const image = await new Promise((resolve, reject) => {
    const preview = new Image();
    preview.onload = () => resolve(preview);
    preview.onerror = reject;
    preview.src = imageUrl;
  });
  URL.revokeObjectURL(imageUrl);

  let width = Math.min(image.naturalWidth, 700);
  let height = Math.round(image.naturalHeight * (width / image.naturalWidth));
  let output = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    output = canvas.toDataURL("image/jpeg", Math.max(0.4, 0.8 - attempt * 0.15));
    if (output.length <= 80000) break;
    width = Math.round(width * 0.75);
    height = Math.round(height * 0.75);
  }
  if (output.length > 80000) throw new Error("Image is too large after optimisation.");
  return output;
}

export default function VendorProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    description: "",
    vendorHints: "",
    seoTitle: "",
    shortDescription: "",
    metaTitle: "",
    metaDescription: "",
    seoKeywords: "",
    productTags: "",
    keyFeatures: "",
    category: "",
    price: "",
    stock: "",
    imageUrl: "",
  });
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatingSeo, setGeneratingSeo] = useState(false);
  const [descriptionError, setDescriptionError] = useState("");
  const [descriptionProvider, setDescriptionProvider] = useState("");
  const [seoError, setSeoError] = useState("");
  const [seoProvider, setSeoProvider] = useState("");
  const blurTimeout = useRef(null);
  const imageInput = useRef(null);

  useEffect(() => {
    if (isEdit) {
      api.get("/vendor/products").then((res) => {
        const product = res.data.find((p) => String(p.id) === id);
        if (product) {
          setForm({
            name: product.name,
            description: product.description || "",
            vendorHints: product.vendor_hints || "",
            seoTitle: product.seo_title || "",
            shortDescription: product.short_description || "",
            metaTitle: product.meta_title || "",
            metaDescription: product.meta_description || "",
            seoKeywords: product.seo_keywords || "",
            productTags: product.product_tags || "",
            keyFeatures: product.key_features || "",
            category: product.category,
            price: product.price,
            stock: product.stock,
            imageUrl: product.image_url || "",
          });
        }
      });
    }
  }, [id, isEdit]);

  const handleNameChange = async (e) => {
    const value = e.target.value;
    setForm({ ...form, name: value });
    if (value.length > 0) {
      const { data } = await api.get("/vendor/products/suggestions", { params: { q: value } });
      setSuggestions(data);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleGenerateDescription = async () => {
    const name = form.name.trim();
    const category = form.category.trim();
    if (!name || !category) {
      setDescriptionError("Enter a product name and category first.");
      return;
    }
    if (!form.vendorHints.trim()) {
      setDescriptionError("Add verified product details first so AI can write a specific, accurate description.");
      return;
    }
    setDescriptionError("");
    setGeneratingDescription(true);
    try {
      const res = await api.post("/ai/generate-description", {
        name,
        category,
        hints: form.vendorHints
      });
      setForm((prev) => ({ ...prev, description: res.data.description || "" }));
      setDescriptionProvider(res.data.provider || "Local (grounded)");
    } catch (err) {
      const apiError = err.response?.data?.error || err.response?.data?.detail;
      setDescriptionError(
        typeof apiError === "string"
          ? apiError
          : err.message === "Network Error"
            ? "Could not reach the AI service. Check that the ShopSense API is running and try again."
            : "Unable to generate a description. Please try again."
      );
    } finally {
      setGeneratingDescription(false);
    }
  };

  const handleGenerateSeoFields = async () => {
    const name = form.name.trim();
    const category = form.category.trim();
    if (!name || !category) {
      setSeoError("Enter a product name and category first.");
      return;
    }
    setSeoError("");
    setGeneratingSeo(true);
    try {
      const res = await api.post("/ai/generate-seo-content", {
        name,
        category,
        hints: form.vendorHints
      });
      setSeoProvider(res.data.provider || "AI");
      setForm((prev) => ({
        ...prev,
        seoTitle: res.data.seoTitle || "",
        shortDescription: res.data.shortDescription || "",
        metaTitle: res.data.metaTitle || "",
        metaDescription: res.data.metaDescription || "",
        seoKeywords: (res.data.seoKeywords || []).join(", "),
        productTags: (res.data.productTags || []).join(", "),
        keyFeatures: (res.data.keyFeatures || []).join("\n")
      }));
    } catch (err) {
      const msg = err.response?.data?.error || "Unable to generate SEO content. Please try again.";
      setSeoError(msg);
    } finally {
      setGeneratingSeo(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/vendor/products/${id}`, form);
      } else {
        await api.post("/vendor/products", form);
      }
      window.dispatchEvent(new Event("inventory-updated"));
      navigate("/vendor/catalog");
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (file) => {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setUploadingImage(true);
    try {
      const imageData = await createProductImageData(file);
      setForm((current) => ({ ...current, imageUrl: imageData }));
    } catch {
      setError("Unable to prepare this image. Try another JPG, PNG, WebP, or GIF file.");
    } finally {
      setUploadingImage(false);
      setIsDraggingImage(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold mb-1">
          {isEdit ? "Edit Product" : "Add New Product"}
        </h1>
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {isEdit ? "Update your product listing details" : "Create a new product listing for your catalog"}
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 text-sm px-4 py-3 rounded-lg flex items-start gap-2" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Product Information Section */}
        <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 mb-5 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "var(--primary)", color: "white" }}
            >
              <Package size={16} />
            </div>
            <div>
              <h2 className="font-semibold text-base">Product Information</h2>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Basic details about your product</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Product Name */}
            <div className="relative lg:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>
                Product Name <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                required
                value={form.name}
                onChange={handleNameChange}
                onFocus={() => form.name && setShowSuggestions(true)}
                onBlur={() => { blurTimeout.current = setTimeout(() => setShowSuggestions(false), 120); }}
                placeholder="e.g. Wireless Bluetooth Headphones"
                className="w-full px-4 py-3 rounded-lg text-sm focus-ring"
                style={{ border: "1px solid var(--border)" }}
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul
                  className="absolute z-20 w-full mt-1 rounded-lg overflow-hidden text-sm shadow-xl"
                  style={{ background: "var(--sidebar)", border: "1px solid var(--border)" }}
                >
                  {suggestions.map((s, idx) => {
                    const name = typeof s === "object" ? s.name : s;
                    const cat = typeof s === "object" ? s.category : "";
                    const price = typeof s === "object" ? s.price : null;
                    const origin = typeof s === "object" && s.origin === "dataset" ? "Dataset" : "";
                    return (
                      <li
                        key={`${name}-${idx}`}
                        onMouseDown={() => {
                          if (typeof s === "object" && s !== null) {
                            setForm((prev) => ({
                              ...prev,
                              name: s.name || prev.name,
                              category: s.category || prev.category,
                              price: s.price != null ? String(s.price) : prev.price,
                              stock: s.stock != null ? String(s.stock) : prev.stock,
                              description: prev.description || `${s.name} - high quality ${s.category?.toLowerCase() || "item"} from catalog.`
                            }));
                          } else {
                            setForm((prev) => ({ ...prev, name: s }));
                          }
                          setShowSuggestions(false);
                        }}
                        className="px-4 py-2.5 cursor-pointer text-white hover:bg-white/10 flex items-center justify-between transition-colors border-b border-white/5 last:border-0"
                      >
                        <div>
                          <div className="font-medium text-white">{name}</div>
                          {cat && <div className="text-xs text-white/60">{cat} {price ? `· ₹${price}` : ""}</div>}
                        </div>
                        {origin && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold uppercase">
                            {origin}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>
                Category <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              {form.category === "Other" || (form.category && !CATEGORIES.includes(form.category)) ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    required
                    value={form.category === "Other" ? "" : form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="Enter custom category (e.g., Furniture, Toys, Books)"
                    className="w-full px-4 py-3 rounded-lg text-sm focus-ring"
                    style={{ border: "1px solid var(--border)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, category: "" })}
                    className="text-xs hover:underline"
                    style={{ color: "var(--primary)" }}
                  >
                    ← Back to category list
                  </button>
                </div>
              ) : (
                <select
                  required
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg text-sm focus-ring"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <option value="">Select a category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
              <p className="mt-2 text-xs" style={{ color: "var(--ink-soft)" }}>
                {form.category === "Other" || (form.category && !CATEGORIES.includes(form.category))
                  ? "Enter a custom category name that best describes your product"
                  : "Select 'Other' to enter a custom category"}
              </p>
            </div>

            {/* Product description */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>
                  Product Description <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={handleGenerateDescription}
                  disabled={generatingDescription || !form.name.trim() || !form.category.trim() || !form.vendorHints.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                  style={{ background: "var(--primary)", color: "white" }}
                  title={!form.name.trim() || !form.category.trim()
                    ? "Enter product name and category first"
                    : !form.vendorHints.trim()
                      ? "Add verified product details first"
                      : "Generate an editable AI description"}
                >
                  {generatingDescription ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      Generate AI description
                    </>
                  )}
                </button>
              </div>
              <textarea
                required
                rows={4}
                value={form.description}
                onChange={(e) => { setForm({ ...form, description: e.target.value }); setDescriptionError(""); }}
                placeholder="Describe your product and its verified details"
                className="w-full px-4 py-3 rounded-lg text-sm focus-ring resize-none"
                style={{ border: "1px solid var(--border)" }}
              />
              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>
                Verified product details
                <textarea
                  rows={3}
                  value={form.vendorHints}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, vendorHints: e.target.value }));
                    setDescriptionError("");
                  }}
                  placeholder="Add accurate features and specifications, such as material, dimensions, capacity, included items, or compatibility."
                  className="mt-2 w-full px-4 py-3 rounded-lg text-sm font-normal normal-case focus-ring resize-y"
                  style={{ border: "1px solid var(--border)", color: "var(--ink)" }}
                />
                <span className="mt-1 block font-normal normal-case">
                  AI uses these details to write specific copy. Include only verified facts. At least one detail is required to enable AI description generation.
                </span>
              </label>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
                The description is editable and generated from your product name, category, and verified details.
                {descriptionProvider && ` Generated with ${descriptionProvider}.`}
              </p>
              {descriptionError && (
                <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: "var(--danger)" }}>
                  <AlertCircle size={12} />
                  {descriptionError}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 mb-5 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--primary)", color: "white" }}>
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="font-semibold text-base">SEO Content</h2>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                Review and edit these fields before saving your product{seoProvider ? ` · Generated with ${seoProvider}` : ""}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>
              SEO Product Title
              <input
                value={form.seoTitle}
                onChange={(e) => setForm((prev) => ({ ...prev, seoTitle: e.target.value }))}
                maxLength={160}
                className="mt-2 w-full px-4 py-3 rounded-lg text-sm font-normal normal-case focus-ring"
                style={{ border: "1px solid var(--border)", color: "var(--ink)" }}
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>
              Short Description
              <textarea
                rows={2}
                value={form.shortDescription}
                onChange={(e) => setForm((prev) => ({ ...prev, shortDescription: e.target.value }))}
                maxLength={500}
                className="mt-2 w-full px-4 py-3 rounded-lg text-sm font-normal normal-case focus-ring resize-y"
                style={{ border: "1px solid var(--border)", color: "var(--ink)" }}
              />
            </label>
            <details className="lg:col-span-2 rounded-lg" style={{ border: "1px solid var(--border)" }}>
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold" style={{ color: "var(--ink)" }}>
                Advanced SEO fields
              </summary>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 pt-1">
                <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    Optional fields for search previews, tags, and product details.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateSeoFields}
                    disabled={generatingSeo || !form.name.trim() || !form.category.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                    style={{ border: "1px solid var(--border)", color: "var(--primary)" }}
                  >
                    {generatingSeo ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {generatingSeo ? "Generating SEO fields…" : "Generate SEO fields"}
                  </button>
                </div>
                {seoError && (
                  <p className="lg:col-span-2 flex items-center gap-1.5 text-xs" style={{ color: "var(--danger)" }}>
                    <AlertCircle size={12} />
                    {seoError}
                  </p>
                )}
                <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>
                  Meta Title
                  <input
                    value={form.metaTitle}
                    onChange={(e) => setForm((prev) => ({ ...prev, metaTitle: e.target.value }))}
                    maxLength={160}
                    className="mt-2 w-full px-4 py-3 rounded-lg text-sm font-normal normal-case focus-ring"
                    style={{ border: "1px solid var(--border)", color: "var(--ink)" }}
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>
                  Meta Description
                  <textarea
                    rows={2}
                    value={form.metaDescription}
                    onChange={(e) => setForm((prev) => ({ ...prev, metaDescription: e.target.value }))}
                    maxLength={320}
                    className="mt-2 w-full px-4 py-3 rounded-lg text-sm font-normal normal-case focus-ring resize-y"
                    style={{ border: "1px solid var(--border)", color: "var(--ink)" }}
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>
                  SEO Keywords
                  <textarea
                    rows={2}
                    value={form.seoKeywords}
                    onChange={(e) => setForm((prev) => ({ ...prev, seoKeywords: e.target.value }))}
                    maxLength={1000}
                    placeholder="Comma-separated keywords"
                    className="mt-2 w-full px-4 py-3 rounded-lg text-sm font-normal normal-case focus-ring resize-y"
                    style={{ border: "1px solid var(--border)", color: "var(--ink)" }}
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>
                  Product Tags
                  <textarea
                    rows={2}
                    value={form.productTags}
                    onChange={(e) => setForm((prev) => ({ ...prev, productTags: e.target.value }))}
                    maxLength={1000}
                    placeholder="Comma-separated tags"
                    className="mt-2 w-full px-4 py-3 rounded-lg text-sm font-normal normal-case focus-ring resize-y"
                    style={{ border: "1px solid var(--border)", color: "var(--ink)" }}
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wide lg:col-span-2" style={{ color: "var(--ink-soft)" }}>
                  Key Features
                  <textarea
                    rows={4}
                    value={form.keyFeatures}
                    onChange={(e) => setForm((prev) => ({ ...prev, keyFeatures: e.target.value }))}
                    maxLength={2000}
                    placeholder="One feature per line"
                    className="mt-2 w-full px-4 py-3 rounded-lg text-sm font-normal normal-case focus-ring resize-y"
                    style={{ border: "1px solid var(--border)", color: "var(--ink)" }}
                  />
                </label>
              </div>
            </details>
          </div>
        </div>

        {/* Pricing & Inventory Section */}
        <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 mb-5 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "var(--accent)", color: "#0d1e1a" }}
            >
              <DollarSign size={16} />
            </div>
            <div>
              <h2 className="font-semibold text-base">Pricing & Inventory</h2>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Set your product price and stock levels</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>
                Price (INR) <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-semibold" style={{ color: "var(--ink-soft)" }}>₹</span>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-3 rounded-lg text-sm focus-ring font-mono-stat"
                  style={{ border: "1px solid var(--border)" }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>
                Stock Quantity <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                required
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                placeholder="0"
                className="w-full px-4 py-3 rounded-lg text-sm focus-ring"
                style={{ border: "1px solid var(--border)" }}
              />
            </div>
          </div>
        </div>

        {/* Media Section */}
        <details
          className="rounded-xl p-6"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          defaultOpen={isEdit}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 pb-4">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "var(--success)", color: "white" }}
            >
              <ImageIcon size={16} />
            </div>
            <div>
              <h2 className="font-semibold text-base">Product Media</h2>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {form.imageUrl ? "Product image added" : "Optional — add an image to showcase your product"}
              </p>
            </div>
          </summary>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-soft)" }}>
              Product Image <span className="normal-case font-normal text-[10px]">(optional)</span>
            </label>
            
            {/* Image Upload Area */}
            <div
              className="rounded-xl border-2 border-dashed p-6 transition-all"
              style={{ 
                borderColor: isDraggingImage ? "var(--primary)" : "var(--border)", 
                background: isDraggingImage ? "var(--primary-light)/10" : "var(--surface)" 
              }}
              onDragEnter={(event) => { event.preventDefault(); setIsDraggingImage(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDraggingImage(false)}
              onDrop={(event) => { event.preventDefault(); uploadImage(event.dataTransfer.files[0]); }}
            >
              <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                <div 
                  className="w-20 h-20 shrink-0 rounded-xl flex items-center justify-center overflow-hidden" 
                  style={{ background: "var(--card)", border: "2px solid var(--border)" }}
                >
                  {form.imageUrl ? (
                    <ProductImage src={form.imageUrl} alt="Product preview" />
                  ) : (
                    <ImageUp size={32} style={{ color: "var(--ink-soft)" }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold mb-1">
                    {form.imageUrl ? "Image uploaded" : "Drop your product image here"}
                  </p>
                  <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
                    JPG, PNG, WebP, or GIF · Maximum 5 MB
                  </p>
                  <input 
                    ref={imageInput} 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(event) => uploadImage(event.target.files[0])} 
                  />
                  <button 
                    type="button" 
                    onClick={() => imageInput.current?.click()} 
                    disabled={uploadingImage} 
                    className="px-4 py-2 rounded-lg text-xs font-semibold focus-ring disabled:opacity-60 transition-all hover:opacity-90" 
                    style={{ background: "var(--primary)", color: "white" }}
                  >
                    {uploadingImage ? "Uploading…" : form.imageUrl ? "Change image" : "Choose image"}
                  </button>
                </div>
              </div>
            </div>

            {/* Image URL Input */}
            <div className="mt-4">
              <label className="block text-xs font-medium mb-2" style={{ color: "var(--primary)" }}>
                Or paste an image URL
              </label>
              <input
                type="text"
                value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="https://example.com/product-image.jpg or /uploads/image.jpg"
                className="w-full px-4 py-2.5 rounded-lg text-sm focus-ring"
                style={{ border: "1px solid var(--border)" }}
              />
            </div>
          </div>
        </details>

        {/* Submit Button */}
        <div
          className="sticky bottom-0 z-10 flex gap-3 -mx-4 px-4 py-3 sm:-mx-6 sm:px-6"
          style={{ background: "var(--card)", borderTop: "1px solid var(--border)" }}
        >
          <button
            type="button"
            onClick={() => navigate("/vendor/catalog")}
            className="px-6 py-3 rounded-lg text-sm font-semibold focus-ring transition-all hover:opacity-80"
            style={{ border: "1px solid var(--border)", color: "var(--ink)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-60 focus-ring transition-all hover:opacity-90"
            style={{ background: "var(--primary)" }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Saving…
              </span>
            ) : (
              isEdit ? "Save changes" : "Add to catalog"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
