// Homepage live photo: every frame of an iPhone Live Photo, redrawn by hand.
// Like the Photos app it rests on the cover frame, plays through once when it
// first comes into view, and again on hover or long press, then settles back.
// Neighbouring frames are cross-faded so the motion stays smooth.
(() => {
  "use strict";

  const figure = document.getElementById("live");
  if (!figure) return;
  const img = figure.querySelector("img");
  const count = Number(figure.dataset.frames);
  const fps = Number(figure.dataset.fps);
  const urls = Array.from({ length: count }, (_, i) => figure.dataset.src.replace("{n}", i + 1));
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const settleFrames = 5;  // frames spent dissolving from the last pose back to the cover

  let frames = null;
  let canvas = null;
  let ctx = null;
  let start = 0;
  let playing = false;

  function load(url) {
    return new Promise((resolve, reject) => {
      const frame = new Image();
      frame.onload = () => resolve(frame);
      frame.onerror = reject;
      frame.src = url;
    });
  }

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(img.clientWidth * dpr);
    canvas.height = Math.round(img.clientHeight * dpr);
  }

  function draw(frame, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
  }

  function tick(time) {
    if (!start) start = time;
    const position = (time - start) / 1000 * fps;
    const i = Math.floor(position);
    if (i >= count - 1 + settleFrames) {
      // Back on the cover: hand over to the still image underneath.
      playing = false;
      figure.classList.remove("is-playing");
      canvas.hidden = true;
      return;
    }
    if (i < count - 1) {
      draw(frames[i], 1);
      draw(frames[i + 1], position - i);
    } else {
      draw(frames[count - 1], 1);
      draw(frames[0], (position - (count - 1)) / settleFrames);
    }
    window.requestAnimationFrame(tick);
  }

  function play() {
    if (playing || !frames) return;
    playing = true;
    start = 0;
    canvas.hidden = false;
    figure.classList.add("is-playing");
    window.requestAnimationFrame(tick);
  }

  function prepare() {
    Promise.all(urls.map(load)).then(loaded => {
      frames = loaded;
      canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.hidden = true;
      ctx = canvas.getContext("2d");
      img.after(canvas);
      size();
      window.addEventListener("resize", size);

      figure.addEventListener("pointerenter", event => { if (event.pointerType === "mouse") play(); });
      figure.addEventListener("pointerdown", play);
      figure.addEventListener("contextmenu", event => event.preventDefault());

      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(entries => {
          if (entries[0].isIntersecting) {
            observer.disconnect();
            play();
          }
        }, { threshold: 0.5 });
        observer.observe(figure);
      } else {
        play();
      }
    }).catch(() => {});
  }

  if (document.readyState === "complete") prepare();
  else window.addEventListener("load", prepare);
})();
