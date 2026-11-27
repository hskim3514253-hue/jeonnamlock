import { createRoot } from "react-dom/client";
import PictureRailGallery from "@/components/ui/picture-rail-gallery";
import type { PictureRailItem } from "@/components/ui/picture-rail-gallery";

// The gallery lives in a shadow root: its Tailwind styles stay inside, the site's styles stay outside.
const host = document.getElementById("rail-gallery");
const data = document.getElementById("rail-gallery-items");
if (host && data && !host.shadowRoot) {
  const items = JSON.parse(data.textContent ?? "[]") as PictureRailItem[];
  // Styles are fetched and adopted into the shadow root, so they never touch the page itself.
  fetch("/rail-gallery.css").then((response) => (response.ok ? response.text() : Promise.reject(response.status))).then((css) => {
    const styles = new CSSStyleSheet();
    styles.replaceSync(css);
    // Only once the styles are in does the gallery replace the plain list of links.
    const root = host.attachShadow({ mode: "open" });
    root.adoptedStyleSheets = [styles];
    const mount = document.createElement("div");
    root.append(mount);
    createRoot(mount).render(
      <PictureRailGallery
        items={items}
        caption=""
        autoplay
        labels={{ front: "앞면", back: "뒷면", close: "닫기", open: "눌러서 제품 보기", view: "제품 상세 보기" }}
      />,
    );
  }).catch(() => { /* the plain list of product links stays */ });
}
