// Step 3 DOM-grounding probe. Run via: playwright-cli eval "$(cat block-probe.js)"
// NOTE: must be a bare arrow function () => {...}; playwright-cli eval CALLS it (not an IIFE).
// Returns the visible, in-content structural components on the page — the real anchoring
// selectors + item structure the LLM needs to write a block spec. Detects three shapes:
//   grid     — a container with >=3 uniform-class children (cards, logos, features)
//   accordion — .accordion / [role=presentation] with item children (FAQ etc.)
//   carousel  — splide/swiper/slick slide tracks
// Excludes nav/header/footer chrome and zero-area (hidden) nodes.
() => {
	const clean = (c) =>
		String(c || "")
			.trim()
			.split(/\s+/)
			.slice(0, 3)
			.join(".");
	const heading = (el) =>
		(
			el.previousElementSibling?.textContent ||
			el.closest("section,div")?.querySelector("h1,h2,h3")?.textContent ||
			""
		)
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 48);
	const chrome = (el) =>
		el.closest("nav,header,footer,.sub-menu,.mega-menu-top,.footer-menu-wrap");
	const rect = (el) => el.getBoundingClientRect();
	const out = { grids: [], accordions: [], carousels: [] };
	const seen = new Set();

	document.querySelectorAll("div,ul,section").forEach((el) => {
		if (chrome(el)) return;
		const r = rect(el);
		if (r.width < 300 || r.height < 120) return;
		const kids = [...el.children];
		if (kids.length < 3) return;
		const sig = kids[0].tagName + "." + clean(kids[0].className);
		const uniform = kids.filter(
			(k) => k.tagName + "." + clean(k.className) === sig,
		).length;
		if (uniform >= 3 && uniform >= kids.length * 0.8) {
			const key = "g:" + el.tagName + clean(el.className) + uniform;
			if (seen.has(key)) return;
			seen.add(key);
			out.grids.push({
				count: uniform,
				container: el.tagName + "." + clean(el.className),
				item: kids[0].tagName + "." + clean(kids[0].className),
				area: Math.round(r.width) + "x" + Math.round(r.height),
				heading: heading(el),
			});
		}
	});

	document
		.querySelectorAll(".accordion,[role=presentation],[class*=accordion]")
		.forEach((el) => {
			if (chrome(el)) return;
			const r = rect(el);
			if (r.width < 200 || r.height < 60) return;
			const items = [...el.children].filter((k) =>
				/item|card|faq|panel/i.test(k.className),
			);
			if (!items.length) return;
			const key = "a:" + clean(el.className);
			if (seen.has(key)) return;
			seen.add(key);
			out.accordions.push({
				container: el.tagName + "." + clean(el.className),
				item: items[0].tagName + "." + clean(items[0].className),
				count: items.length,
				heading: heading(el),
			});
		});

	document
		.querySelectorAll("[class*=splide],[class*=swiper],[class*=slick]")
		.forEach((el) => {
			const track = el.querySelector(
				"[class*=list],[class*=wrapper],[class*=track]",
			);
			if (!track) return;
			const slides = [...track.children];
			if (slides.length < 2) return;
			const key = "c:" + clean(el.className);
			if (seen.has(key)) return;
			seen.add(key);
			out.carousels.push({
				container: el.tagName + "." + clean(el.className),
				slide: slides[0].tagName + "." + clean(slides[0].className),
				count: slides.length,
				heading: heading(el),
			});
		});

	return JSON.stringify(out);
};
