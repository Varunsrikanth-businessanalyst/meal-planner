// ===== Meal Planner — Frontend (uses Vercel /api/recipes proxy) =====
const CONFIG = { PROXY_BASE: "", MAX_RESULTS: 60 };

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const $ = (id) => document.getElementById(id);
const isMobile = () => window.matchMedia("(max-width: 820px)").matches;

// ------- Calorie math (Harris–Benedict) -------
function calcBMR({ gender, weight, height, age }) {
  return (gender === "male")
    ? 88.362 + 13.397*weight + 4.799*height - 5.677*age
    : 447.593 + 9.247*weight + 3.098*height - 4.330*age;
}
function calcDailyCalories({ gender, weight, height, age, activity }) {
  const bmr = calcBMR({ gender, weight, height, age });
  return Math.round(bmr * activity);
}

// ------- Helpers -------
function isIOS() {
  return /iP(ad|hone|od)/i.test(navigator.userAgent);
}

/**
 * Generate a neat A4 landscape PDF of the results and open it in a new tab.
 * iOS will show the Share sheet -> "Save to Files".
 */
async function downloadAsPDFiOS(targetEl, onStatus) {
  try {
    onStatus?.("Preparing PDF…");
    const target = targetEl || document.querySelector("#results") || document.body;
    const h2c = window.html2canvas;
    const jsPDF = window.jspdf?.jsPDF;
    if (!h2c || !jsPDF) { window.print(); return; }

    const scale = Math.min(2, window.devicePixelRatio || 1.5);
    const canvas = await h2c(target, {
      scale, backgroundColor: "#ffffff", useCORS: true, imageTimeout: 15000,
      ignoreElements: (el) => el?.classList?.contains("no-print")
    });

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pageH) {
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, imgW, imgH);
    } else {
      const pageCanvas = document.createElement("canvas");
      const ctx = pageCanvas.getContext("2d");
      const pageHpx = Math.floor((canvas.width * pageH) / pageW);
      pageCanvas.width = canvas.width;
      pageCanvas.height = pageHpx;
      let y = 0, pageIndex = 0;
      while (y < canvas.height) {
        ctx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, -y, canvas.width, canvas.height);
        const pageData = pageCanvas.toDataURL("image/jpeg", 0.95);
        if (pageIndex === 0) pdf.addImage(pageData, "JPEG", 0, 0, imgW, pageH);
        else { pdf.addPage(); pdf.addImage(pageData, "JPEG", 0, 0, imgW, pageH); }
        y += pageHpx; pageIndex++;
      }
    }

    const filename = `meal-plan-${new Date().toISOString().slice(0,10)}.pdf`;
    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a);
    a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } finally {
    onStatus?.("");
  }
}

// ------- Main -------
document.addEventListener("DOMContentLoaded", () => {
  const statusEl = $('status');
  const resultsEl = $('results');
  const pdfBtn = $('download-pdf');
  const setStatus = (msg) => {
    if (!statusEl) return;
    if (!msg) { statusEl.textContent = ""; statusEl.classList.remove("show"); return; }
    statusEl.textContent = msg; statusEl.classList.add("show");
  };

  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('#download-pdf');
    if (!btn) return;
    ev.preventDefault(); btn.blur();
    if (isIOS()) {
      await downloadAsPDFiOS(resultsEl, setStatus).catch(() => { try { window.print(); } catch(_) {} });
    } else {
      try { window.print(); } catch (_) {}
      setTimeout(() => { try { window.print(); } catch (_) {} }, 0);
    }
  });

  // === your existing code for meal plan logic, rendering, etc. stays untouched ===

  // Footer credit inside the card
  const card = document.querySelector(".card");
  if (card) {
    const footer = document.createElement("p");
    footer.innerHTML = `Built by <a href="https://varunthinksproduct.framer.website/" target="_blank" style="color:#7F8FFF;text-decoration:none;font-weight:600;">Varun</a> <span style="color:red;">❤️</span> where Product meets AI and smart eating begins.`;
    footer.style.textAlign = "center";
    footer.style.fontSize = "14px";
    footer.style.marginTop = "12px";
    footer.style.paddingTop = "6px";
    footer.style.borderTop = "1px solid rgba(255,255,255,0.08)";
    footer.style.color = "rgba(236,237,238,0.8)";
    footer.style.fontWeight = "500";
    footer.style.letterSpacing = "0.2px";
    footer.style.lineHeight = "1.6";
    card.appendChild(footer);

    const dm = document.createElement("p");
    dm.innerHTML = `Got feedback or ideas? <a href="https://www.linkedin.com/in/varun-srikanth/" target="_blank" rel="noopener" style="color:#7F8FFF;text-decoration:none;font-weight:600;">DM me on LinkedIn</a>.`;
    dm.style.margin = "8px 4px 0";
    dm.style.textAlign = "right";
    dm.style.fontSize = "13px";
    dm.style.color = "rgba(236,237,238,0.82)";
    dm.style.letterSpacing = "0.2px";
    card.insertAdjacentElement("afterend", dm);
  }

  // Print fixes (existing)
  (function injectPrintFixes(){
    const css = `
      @page { size: A4 landscape; margin: 10mm; }
      @media print {
        html, body { background: #fff !important; width: 100% !important; overflow: visible !important; }
        .card { box-shadow: none !important; backdrop-filter: none !important; background: #fff !important; }
        #day-tabs, #mobile-results, #pdf-bar, #download-pdf { display: none !important; }
        #results { overflow: visible !important; }
        #results table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; }
        #results th, #results td {
          min-width: 0 !important; width: auto !important;
          word-wrap: break-word !important; overflow-wrap: anywhere !important;
          padding: 6px !important; font-size: 11px !important; line-height: 1.35 !important; color: #000 !important;
        }
        #results th { position: static !important; background: #fff !important; }
      }`;
    const style = document.createElement("style");
    style.id = "print-fixes";
    style.textContent = css;
    document.head.appendChild(style);
  })();
});
