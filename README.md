# 🌱 EcoLens — Making Sustainable Shopping Simple

EcoLens is a Chrome extension that provides **real-time, explainable sustainability insights** while you shop online. It analyzes product claims, detects potential greenwashing, and suggests better eco-friendly alternatives—directly at the point of purchase.

> **Tagline:** Turn sustainability claims into verified shopping decisions.

---

## ✨ Features

- **Real-Time Sustainability Analysis**
- **Explainable Sustainability Score (0–100)**
- **Greenwashing Detection**
- **Eco-Friendly Alternatives**
- **Impact Tracking Dashboard**
- **Customizable Weights**
- **Optional AI Enrichment (Gemini)**

---

## 🌍 Sustainability Model

The sustainability score is computed as:

$$
\text{Sustainability Score} = \sum_{i=1}^{n} w_i \cdot s_i
$$

Where:
- `s_i ∈ [0, 100]`
- `∑ w_i = 1`


---

## 🛠️ Built With

- JavaScript (ES Modules)
- HTML5 / CSS3
- Chrome Extensions API (Manifest V3)
- Google Gemini API (optional)
- Chrome Storage
- Node.js

---

## 🚀 Installation

```bash
git clone https://github.com/Jaydeng75/EcoLens.git
cd EcoLens
node scripts/write-icons.js
```

Then load the extension via `chrome://extensions` (Developer Mode).

---

## 📄 License

MIT License © 2026 Jayden Jeswin Raj
