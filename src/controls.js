(() => {
  "use strict";
  // The supplied catalog has no Bel releases. Its two versions are prototype fixtures.
  const stops = [...document.querySelectorAll("#pickerHost [data-family]")];
  const families = stops.map(button => button.textContent.trim());
  const lastFamily = families.length - 1;
  const models = [
    ["6.2", "Sol"], ["6.2", "Astra"], ["6.1", "Terra"], ["6.1", "Sol"],
    ["6", "Astra"], ["6", "Sol"], ["6", "Luna"], ["5.6", "Sol"], ["5.6", "Terra"],
    ["6.2", "Bel"], ["6.1", "Bel"]
  ].map(([version, family]) => ({
    name: "GPT-" + version + " " + family,
    version,
    demo: family === "Bel",
    family: families.indexOf(family)
  }));
  const levels = ["Low", "Medium", "High", "Extra", "Max", "Ultra"];
  const ultra = levels.indexOf("Ultra");
  const lastLevel = levels.length - 1;
  const colors = ["#52647e", "#426cab", "#4864c5", "#6353d3", "#7843dc", "#8c43ee"];
  const speeds = ["常速", "Fast", "Ultra Fast"];
  const initial = models[1];
  const byFamily = families.map((_, index) => models.find(model => model.family === index));
  const $ = id => document.getElementById(id);
  const host = $("pickerHost"), panel = $("selectionPanel"), trigger = $("modelTrigger");
  const quick = $("quickView"), versions = $("versionView"), list = $("versionList");
  const modelButton = $("openVersions"), versionButton = $("openFamilyVersions");
  let catalogOpener = modelButton;
  const rail = $("familySlider"), dial = $("dial");
  const speedToggle = $("speedToggle");
  const effortMenu = $("effortMenu"), effortList = $("effortList");
  const scene = window.createSkyScene($("sky"));
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  let model = initial, level = ultra, isDefault = false, position = model.family;
  let speedMode = 0;
  let railHeld = false, dialDrag = null, ignoreDialClick = false;

  const marks = host.querySelector(".rail-centers");
  const modelThumb = marks.querySelector(".model-thumb");
  rail.max = lastFamily;
  stops.forEach((button, index) => {
    const offset = (index * 100 / lastFamily) + "%";
    button.style.setProperty("--stop", offset);
    const tick = document.createElement("i");
    tick.className = "rail-notch";
    tick.style.setProperty("--stop", offset);
    marks.prepend(tick);
  });

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let camera = position, cameraVelocity = 0, cameraFrame = 0, cameraTime = 0;
  let draggingRail = false, pressX = 0;
  let cameraTarget = position, response = 18;

  function paintCamera() {
    host.style.setProperty("--position", (camera * 100 / lastFamily) + "%");
    scene.set(camera, level / ultra, speedMode, railHeld, Math.round(position));
  }
  function settleCamera() {
    cancelAnimationFrame(cameraFrame);
    cameraFrame = 0;
    cameraVelocity = 0;
    camera = position;
    paintCamera();
  }
  function travel(now) {
    cameraFrame = 0;
    if (reducedMotion.matches || panel.hidden || quick.hidden || document.hidden) {
      settleCamera();
      return;
    }
    const dt = clamp((now - cameraTime) / 1000, 0, 0.05);
    cameraTime = now;
    // A tap or release can change the spring's destination mid-flight.
    const error = camera - position;
    const rate = response;
    const decay = Math.exp(-rate * dt);
    const slope = cameraVelocity + rate * error;
    const nextError = (error + slope * dt) * decay;
    cameraVelocity = (cameraVelocity - slope * rate * dt) * decay;
    if (error * nextError <= 0 || (Math.abs(nextError) < 0.002 && Math.abs(cameraVelocity) < 0.12)) {
      settleCamera();
      return;
    }
    camera = clamp(position + nextError, 0, lastFamily);
    paintCamera();
    cameraFrame = requestAnimationFrame(travel);
  }
  function syncCamera() {
    // All five stops share one reversible camera track. Only taps and release ease.
    if (draggingRail) {
      cameraTarget = position;
      settleCamera();
      return;
    }
    if (cameraTarget !== position) {
      cameraTarget = position;
      const remaining = Math.abs(position - camera);
      response = remaining < 0.55 ? 26 : remaining < 1.5 ? 18 : 14;
      if (cameraVelocity * (position - camera) < 0) cameraVelocity = 0;
    }
    paintCamera();
    if (reducedMotion.matches || panel.hidden || quick.hidden || document.hidden) {
      if (camera !== position || cameraFrame) settleCamera();
      return;
    }
    if (!cameraFrame && camera !== position) {
      cameraTime = performance.now();
      cameraFrame = requestAnimationFrame(travel);
    }
  }

  function draw() {
    const index = Math.round(position);
    const candidate = byFamily[index];
    const label = isDefault && !railHeld ? "默认" : candidate.name;
    const ratio = level / lastLevel;
    host.style.setProperty("--angle", (-135 + ratio * 270) + "deg");
    host.style.setProperty("--sweep", (ratio * 270) + "deg");
    host.style.setProperty("--effort-color", colors[level]);
    rail.value = position;
    rail.setAttribute("aria-valuetext", label);
    stops.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    $("quickEffort").textContent = levels[level];
    $("versionName").textContent = isDefault && !railHeld ? "默认" : families[index];
    $("versionNumber").textContent = candidate.version;
    versionButton.title = "选择 " + families[index] + (candidate.demo ? " 演示版本" : " 版本");
    versionButton.setAttribute("aria-label", versionButton.title + "，当前 " + candidate.version);
    $("triggerModel").textContent = isDefault ? "默认" : model.name;
    $("triggerEffort").textContent = levels[level];
    dial.setAttribute("aria-label", "推理强度 " + levels[level] + "，点击或滑动选择级别");
    for (const option of effortList.children) {
      const i = Number(option.dataset.level);
      option.setAttribute("aria-pressed", String(i === level));
    }
    host.dataset.speed = String(speedMode);
    const speed = speeds[speedMode];
    const nextSpeed = speeds[(speedMode + 1) % speeds.length];
    $("speedLabel").textContent = speedMode ? speed : "";
    speedToggle.title = speed + " · 点击切换到 " + nextSpeed;
    speedToggle.setAttribute("aria-label", "速度：" + speed + "。点击切换到 " + nextSpeed);
    syncCamera();
  }
  function choose(candidate, useDefault = false) {
    model = candidate;
    byFamily[model.family] = model;
    position = model.family;
    isDefault = useDefault;
    draw();
  }
  function chooseFamily(index) {
    choose(byFamily[clamp(Math.round(index), 0, lastFamily)]);
  }
  function setLevel(index) {
    const next = clamp(Math.round(index), 0, lastLevel);
    if (next === level) return;
    level = next;
    draw();
  }
  function showEfforts(open) {
    effortMenu.hidden = !open;
    dial.setAttribute("aria-expanded", String(open));
    if (open) {
      effortList.querySelector('[aria-pressed="true"]').focus({preventScroll:true});
    }
  }
  function view(open, showVersions = false) {
    showEfforts(false);
    panel.hidden = !open;
    quick.hidden = showVersions;
    versions.hidden = !showVersions;
    trigger.setAttribute("aria-expanded", String(open));
    scene.active(open && !showVersions && !document.hidden);
  }
  function openCatalog(opener) {
    catalogOpener = opener;
    const scoped = opener === versionButton;
    $("versionHeading").textContent = scoped ? families[model.family] + (model.demo ? " 演示版本" : " 版本") : "选择模型";
    for (const button of list.children) {
      const item = models[Number(button.dataset.index)];
      button.hidden = scoped && item?.family !== model.family;
      const selected = item ? item === model && (scoped || !isDefault) : isDefault;
      button.setAttribute("aria-pressed", String(selected && !button.hidden));
    }
    view(true, true);
    const active = list.querySelector('[aria-pressed="true"]');
    active.focus({preventScroll:true});
    active.scrollIntoView({block:"nearest"});
  }
  function closeCatalog() {
    view(true);
    catalogOpener.focus({preventScroll:true});
  }
  const checkMark = '<svg class="check" aria-hidden="true" viewBox="0 0 16 16"><path d="m2.5 8.8 3.7 3.6 7.3-9.2"/></svg>';
  levels.forEach((label, i) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "effort-option";
    option.dataset.level = i;
    option.innerHTML = "<span>" + label + "</span>" + checkMark;
    option.addEventListener("click", () => {
      setLevel(i);
      showEfforts(false);
      dial.focus({preventScroll:true});
    });
    effortList.append(option);
  });
  effortList.addEventListener("keydown", event => {
    const option = event.target.closest("[data-level]");
    if (!option) return;
    const key = {ArrowDown:"ArrowRight", ArrowUp:"ArrowLeft"}[event.key] || event.key;
    const next = stepForKey(key, Number(option.dataset.level), lastLevel);
    if (next !== null) {
      event.preventDefault();
      effortList.children[next].focus();
    }
  });
  dial.addEventListener("click", event => {
    if (ignoreDialClick && event.detail !== 0) {
      ignoreDialClick = false;
      return;
    }
    showEfforts(effortMenu.hidden);
  });
  ["默认", ...models.map(entry => entry.name)].forEach((name, n) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "version-item";
    button.dataset.index = n - 1;
    if (!n) button.title = "本原型以 GPT-6.2 Astra 演示推荐模型集";
    const detail = n ? (models[n-1].demo ? "<small>演示版本</small>" : "") : "<small>推荐模型集</small>";
    button.innerHTML = "<span>" + name + detail + "</span>" + checkMark;
    button.addEventListener("click", () => {
      closeCatalog();
      choose(n ? models[n - 1] : initial, n === 0);
    });
    list.append(button);
  });

  trigger.addEventListener("click", () => {
    view(panel.hidden);
    if (!panel.hidden) rail.focus({preventScroll:true});
  });
  modelButton.addEventListener("click", () => openCatalog(modelButton));
  versionButton.addEventListener("click", () => openCatalog(versionButton));
  $("backQuick").addEventListener("click", closeCatalog);
  list.addEventListener("keydown", event => {
    const visible = [...list.children].filter(button => !button.hidden);
    const index = visible.indexOf(event.target);
    if (index < 0) return;
    const key = {ArrowDown:"ArrowRight", ArrowUp:"ArrowLeft"}[event.key] || event.key;
    const next = stepForKey(key, index, visible.length - 1);
    if (next !== null) {
      event.preventDefault();
      visible[next].focus();
    }
  });
  speedToggle.addEventListener("click", () => {
    speedMode = (speedMode + 1) % speeds.length;
    draw();
  });
  $("restore").addEventListener("click", () => {
    speedMode = 0;
    families.forEach((_, index) => { byFamily[index] = models.find(item => item.family === index); });
    level = ultra;
    choose(initial);
  });
  stops.forEach((button, index) => button.addEventListener("click", () => chooseFamily(index)));

  function commitRail() {
    railHeld = false;
    draggingRail = false;
    chooseFamily(Number(rail.value));
  }
  rail.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    railHeld = true;
    const thumbBox = modelThumb.getBoundingClientRect();
    draggingRail = event.clientX >= thumbBox.left && event.clientX <= thumbBox.right;
    pressX = event.clientX;
    rail.setPointerCapture(event.pointerId);
  });
  rail.addEventListener("pointermove", event => {
    if (railHeld && Math.abs(event.clientX - pressX) > 2) draggingRail = true;
  });
  rail.addEventListener("input", () => {
    position = Number(rail.value);
    draw();
  });
  rail.addEventListener("pointerup", commitRail);
  rail.addEventListener("change", () => { if (!railHeld) commitRail(); });
  rail.addEventListener("pointercancel", () => {
    railHeld = false;
    draggingRail = false;
    position = model.family;
    draw();
  });

  function stepForKey(key, value, max) {
    if (key === "Home") return 0;
    if (key === "End") return max;
    if (key === "ArrowRight" || key === "ArrowUp") return clamp(value + 1, 0, max);
    if (key === "ArrowLeft" || key === "ArrowDown") return clamp(value - 1, 0, max);
    return null;
  }
  rail.addEventListener("keydown", event => {
    const next = stepForKey(event.key, model.family, lastFamily);
    if (next !== null) {
      event.preventDefault();
      chooseFamily(next);
    }
  });
  dial.addEventListener("keydown", event => {
    const next = stepForKey(event.key, level, lastLevel);
    if (next !== null) {
      event.preventDefault();
      setLevel(next);
    }
  });
  // Lock the first deliberate gesture direction. Both axes adjust only the effort.
  dial.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    dial.focus({preventScroll:true});
    ignoreDialClick = false;
    dialDrag = {id:event.pointerId, x:event.clientX, y:event.clientY, axis:null, startLevel:level};
    dial.setPointerCapture(event.pointerId);
  });
  dial.addEventListener("pointermove", event => {
    if (!dialDrag || event.pointerId !== dialDrag.id) return;
    const dx = event.clientX - dialDrag.x, dy = event.clientY - dialDrag.y;
    if (!dialDrag.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 5) return;
      dialDrag.axis = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
      ignoreDialClick = true;
      showEfforts(false);
    }
    const distance = dialDrag.axis === "horizontal" ? dx : -dy;
    setLevel(dialDrag.startLevel + distance / 11);
  });
  dial.addEventListener("pointerup", event => {
    if (dialDrag && event.pointerId === dialDrag.id) dialDrag = null;
  });
  dial.addEventListener("lostpointercapture", () => {
    if (!dialDrag) return;
    const originalLevel = dialDrag.startLevel;
    dialDrag = null;
    setLevel(originalLevel);
  });
  document.addEventListener("pointerdown", event => {
    if (!panel.hidden && !host.contains(event.target)) {
      view(false);
    } else if (!effortMenu.hidden && !effortMenu.contains(event.target) &&
               !dial.contains(event.target)) {
      showEfforts(false);
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || panel.hidden) return;
    event.preventDefault();
    if (!effortMenu.hidden) {
      showEfforts(false);
      dial.focus({preventScroll:true});
    } else if (!versions.hidden) {
      closeCatalog();
    } else {
      view(false);
      trigger.focus();
    }
  });
  document.addEventListener("visibilitychange", () => {
    scene.active(!document.hidden && !panel.hidden && !quick.hidden);
  });
  draw();
  view(false);
})();
