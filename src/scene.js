(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smooth = (value) => value * value * (3 - 2 * value);
  const mix = (a, b, amount) => a + (b - a) * amount;

  // Stable pseudo-random points keep the sky from flickering while dragging.
  function noise(seed) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  window.createSkyScene = function createSkyScene(canvas) {
    const context = canvas.getContext("2d", { alpha: false });
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    // A handful of the original stars are bright enough to resolve in the wide
    // view. Keep their positions and leave dark space between the small groups.
    const belStarLight = new Map([
      [7,.32], [84,.53], [24,.82], [101,.27], [36,.40], [72,.32], [93,.52],
      [4,.43], [5,.29], [67,.76], [33,.36], [16,.50], [104,.27], [18,.55], [102,.32]
    ]);
    const stars = Array.from({ length: 110 }, (_, index) => ({
      x: noise(index + 3),
      y: noise(index + 61),
      r: 0.28 + noise(index + 127) * 0.9,
      phase: noise(index + 211) * TAU,
      warm: noise(index + 317) > 0.78,
      farLight: belStarLight.get(index) || 0,
    }));
    const dust = Array.from({ length: 66 }, (_, index) => ({
      along: noise(index + 401) * 2 - 1,
      across: (noise(index + 503) * 2 - 1) ** 3,
      r: 0.25 + noise(index + 607) * 1.15,
      phase: noise(index + 709) * TAU,
    }));

    let position = 0;
    let intensity = 0.55;
    let belMix = 0;
    let diskPhase = 0;
    let flowPhase = 0;
    // The selected family owns the one-shot cue, even while the camera is easing.
    let activationCue = "meteor", activationProgress = 1;
    let wake = 0;
    let tempo = 0;
    let sceneTime = 0;
    let solarTurns = 0, solarRate = 0, speedBlend = 0;
    let lunarIdleTime = 0;
    let scrubbing = false;
    let speedMode = 0;
    let lastFrameAt = null;
    let enabled = true;
    let frame = 0;
    let width = 1;
    let height = 1;
    let ratio = 1;

    function fit() {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, bounds.width || canvas.clientWidth || 292);
      const nextHeight = Math.max(1, bounds.height || canvas.clientHeight || 46);
      const nextRatio = Math.min(3, window.devicePixelRatio || 1);
      if (nextWidth === width && nextHeight === height && nextRatio === ratio) return;
      width = nextWidth;
      height = nextHeight;
      ratio = nextRatio;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function gradient(colors) {
      const fill = context.createLinearGradient(0, 0, width, height);
      for (const [stop, color] of colors) fill.addColorStop(stop, color);
      context.fillStyle = fill;
      context.fillRect(0, 0, width, height);
    }

    function radial(x, y, radius, inner, outer) {
      const fill = context.createRadialGradient(x, y, 0, x, y, radius);
      fill.addColorStop(0, inner);
      fill.addColorStop(1, outer);
      context.fillStyle = fill;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    function drawSpeedArcs(alpha, x, y, radius, phaseScale, radiusStart, radiusStep) {
      if (!speedMode) return;
      const ultraFast = speedMode === 2;
      context.save();
      context.globalCompositeOperation = "lighter";
      context.strokeStyle = ultraFast ? "#b792ff" : "#ffd36d";
      context.shadowColor = ultraFast ? "#7049d8" : "#e2a84a";
      context.shadowBlur = ultraFast ? 4.5 : 2;
      context.lineCap = "round";
      context.lineWidth = ultraFast ? 0.7 : 0.48;
      context.globalAlpha = alpha * (ultraFast ? 0.42 : 0.32);
      for (let arc = 0; arc < (ultraFast ? 3 : 2); arc += 1) {
        const start = flowPhase * phaseScale + arc * 2.2;
        context.beginPath();
        context.arc(x, y, radius * (radiusStart + arc * radiusStep), start, start + (ultraFast ? 1.12 : 0.54));
        context.stroke();
      }
      context.restore();
    }

    function drawGalacticStars(time) {
      context.save();
      const inheritedAlpha = context.globalAlpha;
      const wide = pathPhase(belMix,.02,.96);
      for (const star of stars) {
        if (wide === 1 && !star.farLight) continue;
        const twinkle = media.matches ? .75 : .62 + Math.sin(time*1.4+star.phase)*.18;
        const light = mix(.66*(twinkle+intensity*.2), star.farLight*(.65+.10*intensity), wide);
        const r = mix(star.r*(.72+intensity*.38), .23+.45*star.farLight, wide);
        context.globalAlpha = inheritedAlpha*light;
        context.fillStyle = star.warm ? "#ffe0b7" : "#e7f3ff";
        context.beginPath();
        context.arc(star.x*width,star.y*height,r,0,TAU);
        context.fill();
      }
      context.restore();
    }

    const belScale = .123;
    const groupCenterX = .485, groupCenterY = .50;
    const frontTilt = -.08, frontOpening = .39;
    // Orthographic view of a loose group. All orbital planes share their centre
    // but sit nearly edge-on to us, stretching the motion along the narrow rail.
    const astraOrbit = {span:.19, rise:.29, bank:-.05, phase:2.20, rate:.66};
    const neighbors = [
      {size:.051,depth:.48,opening:.52,tilt:.53,spin:.69,seed:47,tone:"203,155,209",
        orbit:{span:.375,rise:.26,bank:.05,phase:.45,rate:.42}, reveal:[.32,.97]},
      {size:.091,depth:.67,opening:.65,tilt:-.28,spin:-1.49,seed:33,tone:"155,196,245",
        orbit:{span:.34,rise:.32,bank:-.06,phase:-.91,rate:.53}, reveal:[.13,.81]},
      {size:.077,depth:.85,opening:.30,tilt:-.43,spin:1.04,seed:19,tone:"238,180,132",
        orbit:{span:.39,rise:.24,bank:.055,phase:3.76,rate:.78}, reveal:[.035,.65]}
    ];

    function clusterPoint(orbit,clock) {
      const angle = orbit.phase + clock*orbit.rate;
      const along = Math.cos(angle), depth = Math.sin(angle);
      return {x:width*(groupCenterX+orbit.span*along), y:height*(groupCenterY+orbit.rise*depth+orbit.bank*along), depth};
    }

    function belStrain(depth) {
      if (!belMix || activationCue !== "wave" || activationProgress >= 1) return 0;
      // Near, middle and far planes respond in that order at every orbital phase.
      const age = (activationProgress-(1-depth)*.51)/(.54+.06*depth);
      if (age <= 0 || age >= 1) return 0;
      let pulse;
      if (age < .29) pulse = smooth(age/.29);
      else if (age < .63) pulse = mix(1,-.27,smooth((age-.29)/.34));
      else pulse = mix(-.27,0,smooth((age-.63)/.37));
      return pulse*belMix*(.19+.81*depth)*(.095+.045*speedBlend)*(media.matches ? .16 : 1);
    }

    function bendBelPlane(strain,x,y) {
      if (!strain) return;
      // Anchor partway toward the group's centre so intergalactic spacing and
      // the shape of each disk deform together. The orbital clock is untouched.
      const pivotX = mix(x,width*groupCenterX,.24), pivotY = mix(y,height*groupCenterY,.24);
      const vertical = 1/Math.sqrt(1+strain), shear = .24*strain, tilt = -.055*strain;
      context.transform(1+strain,tilt,shear,vertical,
        strain*(.025*width-pivotX)-shear*pivotY, (1-vertical)*pivotY-tilt*pivotX);
    }

    function frontRadius(progress) {
      return width*.67*(1-(1-progress)**1.4);
    }

    function frontLightAt(x,y) {
      if (activationCue !== "wave" || activationProgress >= 1 || !belMix) return 0;
      const dx = x-width*groupCenterX, dy = y-height*groupCenterY;
      const c = Math.cos(frontTilt), s = Math.sin(frontTilt);
      const distance = Math.hypot(c*dx+s*dy,(c*dy-s*dx)/frontOpening);
      const offset = (frontRadius(activationProgress)-distance)/(width*.052);
      return belMix*Math.exp(-offset*offset)*pathPhase(activationProgress,0,.12)*
        (1-pathPhase(activationProgress,.64,.98))*(media.matches ? .42 : 1);
    }

    function drawBelWakefront(progress) {
      if (progress <= 0 || progress >= 1) return;
      const radius = frontRadius(progress);
      const strength = belMix*pathPhase(progress,0,.09)*(1-pathPhase(progress,.60,1));
      const tint = ["165,196,243","236,200,146","204,170,248"][speedMode];
      context.save();
      context.translate(width*groupCenterX,height*groupCenterY);
      context.rotate(frontTilt);
      context.scale(1,frontOpening);
      context.globalCompositeOperation = "screen";
      // Only the dust-rich sides of the front catch light. Feather both ends
      // into the sky and soften the leading edge as energy disperses.
      for (const side of [-1,1]) {
        context.save();
        context.scale(side,1);
        const scatter = context.createLinearGradient(0,-radius,0,radius);
        scatter.addColorStop(.02,"rgba("+tint+",0)");
        scatter.addColorStop(side < 0 ? .32 : .50,"rgba("+tint+",.68)");
        scatter.addColorStop(.75,"rgba("+tint+",.28)");
        scatter.addColorStop(.97,"rgba("+tint+",0)");
        context.strokeStyle = scatter;
        context.lineCap = "round";
        context.beginPath();
        for (let i=0;i<=24;i++) {
          const angle = -1.4+i*2.8/24;
          const r = radius*(1+.017*Math.sin(3*angle+side));
          const x = r*Math.cos(angle), y = r*Math.sin(angle);
          if (i===0) context.moveTo(x,y);
          else context.lineTo(x,y);
        }
        const light = strength*(media.matches ? .37 : .63)*(1+.09*speedBlend);
        context.globalAlpha = light*.29;
        context.lineWidth = 4.2+3*progress;
        context.shadowColor = "rgb("+tint+")";
        context.shadowBlur = 5;
        context.stroke();
        context.globalAlpha = light*.69;
        context.lineWidth = .9+.8*progress;
        context.shadowBlur = 1.4;
        context.stroke();
        context.restore();
      }
      context.restore();
    }

    // Paint a face-on stellar disk once. Rotating it inside a fixed inclined
    // plane keeps the nucleus still as asymmetric dust lanes and knots revolve.
    function galaxyTexture(galaxy) {
      const bitmap = document.createElement("canvas");
      bitmap.width = bitmap.height = 192;
      const ink = bitmap.getContext("2d");
      ink.translate(96,96);
      function glow(x,y,r,color,strength) {
        const fill = ink.createRadialGradient(x,y,0,x,y,r);
        fill.addColorStop(0,"rgba("+color+","+strength+")");
        fill.addColorStop(.44,"rgba("+color+","+(strength*.40)+")");
        fill.addColorStop(1,"rgba("+color+",0)");
        ink.fillStyle=fill;
        ink.fillRect(x-r,y-r,2*r,2*r);
      }
      glow(0,0,93,galaxy.tone,.30);
      const seed = galaxy.seed;
      for (let arm=0; arm<2; arm++) {
        for (let j=0; j<104; j++) {
          const f = j/104;
          const k = seed*104 + arm*151 + j;
          const r = 5 + f*(arm ? 74 : 82) + 5*(noise(k)-.5);
          const a = arm*Math.PI + 4.8*Math.sqrt(f) + .16*Math.sin(f*8+seed) + .12*(noise(k+231)-.5);
          const x = r*Math.cos(a), y = r*Math.sin(a);
          const density = (.12+.21*noise(k+99))*(1-.65*f);
          glow(x,y,6+7*noise(k+59),galaxy.tone,density);
          if (j%4===0) glow(x,y,2.5+1.6*noise(k+821),"221,232,253",density*2);
          if ((j===45 && arm===0) || (j===74 && arm===1)) {
            glow(x,y,9,galaxy.tone,.70);
            glow(x,y,3.6,"242,236,222",.88);
          }
        }
      }
      glow(0,0,29,galaxy.tone,.76);
      glow(0,0,13,"252,224,197",.83);
      glow(0,0,5,"255,245,218",.91);
      return bitmap;
    }

    function drawGroupStream(view,galaxy,zoom,x,y,visibility,frontLight) {
      // Short, feathered segments of projected stellar streams expose the group
      // flow. Their distant tails vanish into space before forming a closed ring.
      const span = .94;
      const tail = clusterPoint(galaxy.orbit,diskPhase-span);
      const tailX = view.centerX + (tail.x-view.home.x)*zoom;
      const tailY = view.centerY + (tail.y-view.home.y)*zoom;
      const light = context.createLinearGradient(tailX,tailY,x+.001,y);
      light.addColorStop(0,"rgba("+galaxy.tone+",0)");
      light.addColorStop(.65,"rgba("+galaxy.tone+",.50)");
      light.addColorStop(1,"rgba("+galaxy.tone+",.05)");
      context.strokeStyle = light;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(tailX,tailY);
      for (let i=1;i<=8;i++) {
        const point = clusterPoint(galaxy.orbit,diskPhase-span*(1-i/8));
        context.lineTo(view.centerX+(point.x-view.home.x)*zoom,view.centerY+(point.y-view.home.y)*zoom);
      }
      context.globalAlpha = visibility*(.22+.17*intensity+.08*speedMode+.27*frontLight);
      context.lineWidth=1.65;
      context.stroke();
      context.lineWidth=.48;
      context.stroke();
    }

    function drawNeighborGalaxies(view) {
      if (!belMix) return;
      context.save();
      context.globalCompositeOperation = "screen";
      for (const galaxy of neighbors) {
        // More remote disks traverse less of the frame as the camera retreats.
        const zoom = mix(1,view.wide,galaxy.depth)/mix(1,belScale,galaxy.depth);
        const point = clusterPoint(galaxy.orbit,diskPhase);
        const x = view.centerX + (point.x-view.home.x)*zoom;
        const y = view.centerY + (point.y-view.home.y)*zoom;
        const r = width*galaxy.size*zoom*(1+.12*point.depth);
        const visibility = pathPhase(belMix,...galaxy.reveal);
        if (!visibility || x+r<0 || x-r>width || y+r<0 || y-r>height) continue;
        galaxy.texture ??= galaxyTexture(galaxy);
        context.save();
        bendBelPlane(belStrain(galaxy.depth),x,y);
        const frontLight = frontLightAt(x,y);
        drawGroupStream(view,galaxy,zoom,x,y,visibility,frontLight);
        context.globalAlpha = visibility*Math.min(1,.72+.18*intensity+.045*speedMode+.12*frontLight);
        context.translate(x,y);
        context.rotate(galaxy.tilt);
        context.scale(1,galaxy.opening);
        context.rotate(diskPhase*galaxy.spin + galaxy.seed);
        context.drawImage(galaxy.texture,-r,-r,2*r,2*r);
        context.restore();
      }
      context.restore();
    }

    // Each ridge is a fixed silhouette in the observer's landscape.
    const terraGround = [
      [[0,.73],[.05,.71],[.12,.57],[.15,.61],[.20,.52],[.26,.67],[.32,.62],[.40,.71],[.49,.74],[.56,.65],[.60,.67],[.67,.48],[.71,.55],[.73,.53],[.80,.66],[.87,.57],[.94,.64],[1,.59]],
      [[0,.80],[.08,.75],[.16,.79],[.25,.68],[.33,.70],[.41,.79],[.51,.78],[.62,.73],[.69,.76],[.79,.62],[.85,.67],[.90,.63],[1,.70]],
      [[0,.80],[.08,.84],[.16,.83],[.23,.88],[.34,.9],[.45,.89],[.55,.91],[.68,.86],[.79,.87],[.90,.80],[1,.77]]
    ];
    const terraSkyTones = [
      [[5,12,31],[55,129,186],[69,75,125]],
      [[17,32,62],[121,191,224],[210,126,120]],
      [[36,52,77],[214,228,216],[255,190,124]]
    ];
    const terraGroundTones = [
      [[33,46,72],[102,143,155],[147,110,125]],
      [[20,31,53],[63,108,118],[97,81,103]],
      [[9,20,34],[37,71,68],[56,55,67]]
    ];
    function horizonColor(tones,day,twilight) {
      const [night,sun,glow] = tones;
      const rgb = night.map((v,i) => Math.round(mix(mix(v,sun[i],day),glow[i],twilight)));
      return "rgb(" + rgb.join(",") + ")";
    }

    function pathPhase(position, start, end) {
      return smooth(clamp((position - start) / (end - start), 0, 1));
    }

    // A tangent view of the atmospheric limb. Its centre and curvature are also
    // used to project the distant terrain, so the light stays attached to the horizon.
    function drawAirLimb(centreY, bend, depth, strength, daylight) {
      if (strength <= 0) return;
      context.save();
      context.globalCompositeOperation = "screen";
      context.lineCap = "round";
      const bands = [
        [depth * 1.9, -depth * 0.54, "#3165bd", 0.20],
        [depth, -depth * 0.3, "#589eea", 0.33],
        [Math.max(0.75, depth * 0.28), -depth * 0.10, "#9fe6f5", 0.59]
      ];
      for (const [thickness, offset, color, opacity] of bands) {
        context.strokeStyle = color;
        context.globalAlpha = strength * opacity * (0.67 + 0.33 * daylight);
        context.lineWidth = thickness;
        context.shadowColor = color;
        context.shadowBlur = thickness * 0.65;
        context.beginPath();
        context.moveTo(0, centreY + bend + offset);
        context.quadraticCurveTo(width / 2, centreY - bend + offset, width, centreY + bend + offset);
        context.stroke();
      }
      context.restore();
    }

    function terra(alpha, time, travel = 0) {
      context.save();
      context.globalAlpha = alpha;
      const grade = Math.round(intensity*5);
      // This path is entirely a function of the rail coordinate; no stage timers.
      const pitch = pathPhase(travel, 0, 0.53);
      const lift = pathPhase(travel, 0.12, 0.63);
      const escape = pathPhase(travel, 0.52, 0.80);
      const clearSky = pathPhase(travel, 0.13, 0.73);
      const horizon = height * (0.70 + 0.16 * pitch + 0.53 * escape);
      const bend = height * 0.17 * lift;
      if (travel > 0) {
        const starOffset = -height * 1.16 * (1 - pathPhase(travel, 0.19, 0.83));
        drawSpaceBackdrop(alpha, time, 0.08, starOffset);
      }

      const hour = 0.34 + TAU*time/24;
      const altitude = Math.sin(hour);
      const day = smooth(clamp((altitude+0.21)/0.86,0,1));
      const twilight = 1-smooth(clamp(Math.abs(altitude+0.012)/0.62,0,1));
      const night = 1-smooth(clamp((altitude+0.46)/0.62,0,1));
      const sunX = width*(0.51-0.37*Math.cos(hour));
      const sunY = height*(0.70-0.56*altitude + 0.88*pitch);
      context.globalAlpha = alpha * (1 - clearSky);
      const sky = context.createLinearGradient(0,0,0,height*(0.78 + 0.48*pitch));
      [0,.65,1].forEach((stop,i) => sky.addColorStop(stop,horizonColor(terraSkyTones[i],day,twilight)));
      context.fillStyle=sky;
      context.fillRect(0,0,width,height);

      const airLight = pathPhase(travel, 0.07, 0.38) * (1 - pathPhase(travel, 0.42, 0.79));
      if (airLight > 0) {
        const air = context.createLinearGradient(0, 0, 0, horizon);
        air.addColorStop(0, "#091635");
        air.addColorStop(0.52, "#154272");
        air.addColorStop(0.86, "#337da4");
        air.addColorStop(1, "#93d7df");
        context.globalAlpha = alpha * airLight * (0.45 + day * 0.4);
        context.fillStyle = air;
        context.fillRect(0, 0, width, height);
      }

      // The rotating sky carries each star on its own arc above the fixed horizon.
      for (let i=0, count=night>0.01 ? 34+grade*15 : 0; i<count; ++i) {
        const star=stars[i], a=star.phase+hour;
        const radius=0.46+star.x*0.22;
        const x=width*(0.5-radius*Math.cos(a));
        const y=height*(0.72+(star.x-0.5)*0.16-(0.27+star.y*0.87)*Math.sin(a)+0.88*pitch);
        if (y< -2 || y>height*(0.78+0.88*pitch) || x< -2 || x>width+2) continue;
        const glint=media.matches ? 1 : 0.89+0.11*Math.sin(time*1.2+star.phase);
        context.globalAlpha=alpha*night*glint*(0.62+0.35*intensity)*(1-clearSky);
        if (speedMode && i%6===0) {
          const earlier=a-(speedMode===2?0.085:0.046);
          context.strokeStyle=speedMode===2?"#ceafff":"#ffe2a5";
          context.lineWidth=0.55;
          context.beginPath();
          context.moveTo(width*(0.5-radius*Math.cos(earlier)),
            height*(0.72+(star.x-0.5)*0.16-(0.27+star.y*0.87)*Math.sin(earlier)+0.88*pitch));
          context.lineTo(x,y);context.stroke();
        }
        context.fillStyle=star.warm ? "#ffdfab" : "#deedff";
        context.beginPath();context.arc(x,y,star.r*(0.64+intensity*0.41),0,TAU);context.fill();
      }

      // The glow lingers over the eastern or western ridge during twilight.
      const sunVisibility=smooth(clamp((altitude+0.25)/0.40,0,1)) * (1 - clearSky);
      if (sunVisibility>0) {
        const tint=["rgba(255,200,119,0.76)","rgba(255,199,70,0.84)","rgba(246,158,231,0.67)"][speedMode];
        context.globalAlpha=alpha*sunVisibility*(0.46+twilight*0.35+intensity*0.12);
        radial(sunX,sunY,height*(0.76+twilight*0.60),tint,"rgba(255,174,107,0)");
        context.globalAlpha=alpha*(0.8+0.2*intensity)*(1-clearSky);
        context.fillStyle="#fff2c1";
        context.beginPath();context.arc(sunX,sunY,height*(0.069+twilight*0.022),0,TAU);context.fill();
      }
      // Near cloud wisps descend faster than the mountain ridges as the camera lifts.
      for (let i=0; i<2+grade; ++i) {
        const x=width*((noise(81+i)*1.32+time*0.0035)%1.32-0.16);
        const depth=noise(712+i);
        const y=height*(0.12+depth*0.38+pitch*(0.60+0.39*depth));
        const span=width*(.075+.065*noise(706+i))*(1+0.24*lift);
        context.globalAlpha=alpha*(0.05+0.17*day+0.29*twilight)*(0.68+0.32*noise(802+i))*(1-pathPhase(travel,0.32,0.60));
        context.fillStyle=speedMode===2?"#e2c9ff":speedMode===1?"#ffdf99":"#ffe4cd";
        context.beginPath();context.moveTo(x,y);
        context.bezierCurveTo(x+span*.27,y-.4,x+span*.47,y-2.5,x+span*.62,y-1.3);
        context.quadraticCurveTo(x+span*.82,y-1.7,x+span,y-.55);
        context.bezierCurveTo(x+span*.73,y-.42,x+span*.38,y+1.05,x,y);
        context.fill();
      }

      drawAirLimb(horizon, bend, height * mix(0.27, 0.065, lift),
        alpha * pathPhase(travel, 0.19, 0.45) * (1 - escape), day);
      context.globalAlpha=alpha;
      // Foreground slips out first; the far peaks flatten into the same curved limb.
      const projectGroundY = (x, y, layer) => horizon + height*(y-0.70)*(1-lift)
        + bend*(2*x-1)**2 + height*layer*0.11*pitch;
      terraGround.forEach((points,i) => {
        context.fillStyle=horizonColor(terraGroundTones[i],day*(1-0.76*lift),twilight*(1-lift));
        context.beginPath();context.moveTo(0,height);
        for (const [x,y] of points) context.lineTo(x*width,projectGroundY(x,y,i));
        context.lineTo(width,height);context.closePath();context.fill();
      });
      context.strokeStyle=horizonColor(terraGroundTones[2],day,twilight);
      context.lineWidth=0.65;context.lineCap="round";
      context.beginPath();
      for(let i=0;i<24;i++){
        const u=0.71+0.29*noise(i+422), x=u*width;
        const y=projectGroundY(u,0.9-0.12*(u-0.71)/0.29,2);
        const tip=1.2+3.3*noise(i+340), lean=(noise(i+197)-0.5)*3;
        context.moveTo(x,y+2);context.quadraticCurveTo(x+lean*.25,y-tip*.6,x+lean,y-tip);
      }
      context.stroke();
      context.restore();
    }

    // LRO WAC lunar colour mosaic, reduced to luminance for this 32px disc.
    // Credit: NASA/GSFC/Arizona State University, NASA SVS CGI Moon Kit (svs.gsfc.nasa.gov/4720/).
    const moonMap = Uint8Array.from(atob(SKY_TEXTURES.moonMap), c => c.charCodeAt(0));
    const moonSprite = document.createElement("canvas");
    moonSprite.width = moonSprite.height = 80;
    const moonContext = moonSprite.getContext("2d");
    const moonPixels = moonContext.createImageData(80,80);
    const moonSamples = [];
    for (let y=0;y<80;y++) {
      for (let x=0;x<80;x++) {
        const nx=(x-39.5)/40, ny=(39.5-y)/40, rr=nx*nx+ny*ny;
        if (rr>=1) continue;
        const nz=Math.sqrt(1-rr);
        const sun=Math.max(0,-0.65*nx+0.38*ny+0.66*nz);
        moonSamples.push({
          pixel:4*(y*80+x),
          u:128+Math.atan2(nx,nz)*128/Math.PI,
          row:clamp(Math.floor(64-Math.asin(ny)*128/Math.PI),0,127)*256,
          light:0.08+0.74*Math.sqrt(sun)+0.31*sun/(sun+nz+0.06),
          edge:Math.min(255,nz*1400)
        });
      }
    }
    let lastMoonTurn = NaN, lastMoonDetail = -1;
    function drawLunarDisc(x,y,radius,time,detail,viewLongitude = 0) {
      const turn=((time/10.8 + viewLongitude/TAU)*256)%256;
      if (turn!==lastMoonTurn || detail!==lastMoonDetail) {
        const pixels=moonPixels.data;
        for (const sample of moonSamples) {
          const u=sample.u+turn, column=Math.floor(u);
          const a=moonMap[sample.row+(column&255)], b=moonMap[sample.row+((column+1)&255)];
          const tone=181+(mix(a,b,u-column)-143)*(0.72+detail*0.73);
          const v=tone*sample.light;
          const j=sample.pixel;
          pixels[j]=v*0.99+3; pixels[j+1]=v+5; pixels[j+2]=v*1.015+9; pixels[j+3]=sample.edge;
        }
        moonContext.putImageData(moonPixels,0,0);
        lastMoonTurn=turn; lastMoonDetail=detail;
      }
      context.drawImage(moonSprite,x-radius,y-radius,radius*2,radius*2);
    }

    // One warm reference star, four silver stars and nine much fainter companions.
    // Positions are composed in the panoramic frame, not sampled from a particle cloud.
    const lunarField = [
      [.765,.23,1.02], [.155,.64,.78], [.835,.37,.66], [.405,.18,.61], [.90,.73,.82],
      [.095,.33,.44], [.20,.73,.46], [.323,.28,.40], [.38,.79,.42], [.505,.10,.34],
      [.595,.85,.44], [.685,.65,.39], [.805,.19,.40], [.947,.46,.50]
    ];
    const lunarTints = ["#ffe4bb","#d7e6fa","#8195af"];

    function projectSkyStar(index, time, yaw) {
      const [u,v] = lunarField[index];
      const phase = (time + lunarIdleTime) * TAU / 56 * (index < 5 ? 1 : 0.48);
      const dx = u - 0.48, dy = (v - 0.54) * 0.72;
      const horizontal = 0.48 + dx*Math.cos(phase) - dy*Math.sin(phase) - 0.5;
      const vertical = 0.54 + (dx*Math.sin(phase) + dy*Math.cos(phase))/0.72 - 0.5;
      // A single camera yaw projects the same fixed celestial directions for both bodies.
      const depth = Math.cos(yaw) + horizontal*Math.sin(yaw);
      return {
        x: width*(0.5 + (horizontal*Math.cos(yaw) - Math.sin(yaw))/depth),
        y: height*(0.5 + vertical/depth)
      };
    }

    function drawLunarField(alpha, time, yaw, sunIsSeparate) {
      const inherited = context.globalAlpha;
      for (let i = sunIsSeparate ? 1 : 0; i < lunarField.length; i++) {
        const point = projectSkyStar(i, time, yaw);
        const layer = i === 0 ? 0 : i < 5 ? 1 : 2;
        if (i === 0) {
          context.globalAlpha = inherited*alpha*0.46;
          radial(point.x,point.y,3.6,"rgba(245,209,158,0.52)","rgba(245,209,158,0)");
        }
        context.globalAlpha = inherited*alpha*[0.96,0.76,0.46][layer]*(0.80+0.20*intensity);
        context.fillStyle = lunarTints[layer];
        context.beginPath();
        context.arc(point.x,point.y,lunarField[i][2]*(0.86+0.14*intensity),0,TAU);
        context.fill();
      }
      context.globalAlpha = inherited;
    }

    function drawSpaceBackdrop(alpha, time, warmth = 0, starOffsetY = 0) {
      context.save();
      context.globalAlpha = alpha;
      gradient([[0, "#020713"], [0.5, "#071426"], [1, "#0b1830"]]);
      if (warmth) {
        context.globalAlpha = alpha * warmth * 0.22;
        radial(width * 0.78, height * 0.5, width * 0.38, "rgba(117,53,70,0.52)", "rgba(29,22,54,0)");
      }
      context.globalAlpha = alpha;
      context.translate(0, starOffsetY);
      const pan = pathPhase(position,1,2);
      context.save();
      context.globalAlpha = alpha*(1-pan);
      context.translate(width*0.37,height*0.58);
      context.scale(1,0.28);
      radial(0,0,width*0.49,"rgba(76,107,139,0.16)","rgba(28,55,82,0)");
      context.restore();
      drawLunarField(1,time,0.13*pan,position>1);
      context.restore();
    }

    function luna(alpha, time, approach = 1, departure = 0, withSky = true) {
      context.save();
      context.globalAlpha = alpha;

      // Each of the six effort stops adds atmosphere, relief and surface
      // landmarks without changing the moon's basic silhouette.
      const detail = clamp(intensity, 0, 1);
      const highDetail = smooth(clamp((detail - 0.42) / 0.58, 0, 1));
      const ultraDetail = smooth(clamp((detail - 0.78) / 0.22, 0, 1));
      if (withSky) drawSpaceBackdrop(alpha, time, 0.08);

      // The camera approaches Luna from deep space, then glides past it toward Sol.
      const arrival = smooth(clamp(approach, 0, 1));
      const leaving = pathPhase(departure, 0, 0.78);
      const moonX = mix(width * 0.68, width * 0.5, arrival) - width * 0.91 * leaving;
      const moonY = mix(-height * 0.36, height * 0.5, arrival) + height * 0.28 * leaving;
      const moonR = Math.min(16.2, height * 0.405) * mix(0.16, 1, arrival) * (1 + 0.87*pathPhase(departure,0.008,0.46));

      context.save();
      context.globalCompositeOperation = "screen";
      radial(
        moonX,
        moonY,
        moonR * (1.58 + detail * 0.42),
        `rgba(164,216,255,${0.12 + detail * 0.16})`,
        "rgba(103,172,235,0)"
      );
      context.restore();

      context.globalAlpha = alpha;
      drawLunarDisc(moonX,moonY,moonR,time,detail,0.48*leaving);

      context.save();
      context.beginPath();
      context.arc(moonX,moonY,moonR,0,TAU);
      context.clip();
      // Speed colors stay local to the moon instead of tinting the whole sky.
      if (speedMode) {
        const ultraFast = speedMode === 2;
        const speedLight = context.createRadialGradient(
          moonX + moonR * 0.32,
          moonY - moonR * 0.14,
          0,
          moonX + moonR * 0.32,
          moonY - moonR * 0.14,
          moonR * 1.08
        );
        speedLight.addColorStop(0, ultraFast ? "rgba(205,156,255,0.34)" : "rgba(255,214,109,0.28)");
        speedLight.addColorStop(1, ultraFast ? "rgba(112,66,218,0)" : "rgba(226,159,56,0)");
        context.globalCompositeOperation = "screen";
        context.globalAlpha = alpha * (0.5 + ultraDetail * 0.3);
        context.fillStyle = speedLight;
        context.fillRect(moonX - moonR, moonY - moonR, moonR * 2, moonR * 2);
      }
      context.restore();

      context.globalAlpha = alpha * (0.16 + highDetail * 0.38);
      context.strokeStyle = "#d9eff7";
      context.lineWidth = 0.5;
      context.beginPath();
      context.arc(moonX, moonY, moonR * 0.94, -1.24, 0.74);
      context.stroke();
      drawSpeedArcs(alpha, moonX, moonY, moonR, 0.78, 1.2, 0.17);

      context.restore();
    }

    // False-colour SDO/AIA 171 Å and 304 Å images, NASA/SDO/AIA, 19 Nov 2026.
    // Two off-limb channels: hot corona and chromospheric emission.
    const solarAtlas = Uint8Array.from(atob(SKY_TEXTURES.solarAtlas), c => c.charCodeAt(0));
    const solarSize = 144, nativeSolarRadius = 43.5;
    const solarSurface = document.createElement("canvas");
    const solarCorona = document.createElement("canvas");
    const solarLimb = document.createElement("canvas");
    const solarLayers = [solarSurface,solarCorona,solarLimb].map(canvas => {
      canvas.width = canvas.height = solarSize;
      const ctx = canvas.getContext("2d");
      return {ctx, pixels:ctx.createImageData(solarSize,solarSize)};
    });

    // Deep umber channels and champagne peaks keep the active regions visible at 1×.
    const solarTones = [[82,29,16],[152,56,20],[214,98,28],[246,147,46],[255,199,90],[255,239,176]];
    const solarPalette = Array.from({length:256}, (_, i) => {
      const u=(i/255)*(solarTones.length-1), k=Math.min(solarTones.length-2,Math.floor(u));
      return solarTones[k].map((v,c)=>Math.round(mix(v,solarTones[k+1][c],u-k)));
    });
    // Orthographic view of a 512×256 heliographic map. Only the near hemisphere
    // is observed; the unobserved longitudes have a seamless, simulated texture.
    const solarSphere = Uint8Array.from(atob(SKY_TEXTURES.solarSphere), c => c.charCodeAt(0));
    const solarSamples = [], discSamples = [];
    for (let y=1;y<solarSize-1;y++) for (let x=1;x<solarSize-1;x++) {
      const nx=(x+.5-solarSize/2)/nativeSolarRadius, ny=(y+.5-solarSize/2)/nativeSolarRadius;
      const rho=Math.hypot(nx,ny);
      if(rho>1.64) continue;
      const pixel=4*(y*solarSize+x);
      const edge=clamp((1-rho)*nativeSolarRadius+0.5,0,1);
      if (edge>0) {
        const sinLat=clamp(-ny,-1,1);
        const nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
        const v=clamp((0.5-Math.asin(sinLat)/Math.PI)*256-0.5,0,254.999);
        const row=Math.floor(v);
        discSamples.push({pixel, edge, row:row*512, fy:v-row,
          u:(0.5+Math.atan2(nx,nz)/TAU)*512-0.5,
          // Relative angular velocity: equator 1, poles 25/35.
          rate:1-(2/7)*sinLat*sinLat,
          glow:1+0.065*(1-nz)**3});
      }
      if (rho>=0.98) {
        const angle=Math.atan2(ny,nx);
        solarSamples.push({x,y,pixel,rho,nx,ny,
          sine:Math.sin(angle*3+.4),cosine:Math.cos(angle*3+.4)});
      }
    }
    let lastSolarTurn=NaN, lastSolarDetail=-1;
    let photoTick=-1, photoLevel=-1, photoSpeed=-1;

    function updateSolarPhotos(time,detail) {
      // A change of palette can redraw the same longitude without advancing it.
      if (lastSolarTurn!==solarTurns || lastSolarDetail!==detail) {
        const pixels=solarLayers[0].pixels.data;
        for (const p of discSamples) {
          const u=p.u-solarTurns*512*p.rate;
          const col=Math.floor(u), fx=u-col;
          const i=p.row+(col&511), j=p.row+((col+1)&511);
          const v=mix(mix(solarSphere[i],solarSphere[j],fx),
            mix(solarSphere[i+512],solarSphere[j+512],fx),p.fy);
          const key=clamp(Math.round((132+(v-126)*(.69+.47*detail))*p.glow),0,255);
          const tone=solarPalette[key], k=p.pixel;
          pixels[k]=tone[0];pixels[k+1]=tone[1];pixels[k+2]=tone[2];pixels[k+3]=255*p.edge;
        }
        solarLayers[0].ctx.putImageData(solarLayers[0].pixels,0,0);
        lastSolarTurn=solarTurns;lastSolarDetail=detail;
      }

      const tick=Math.floor(time*28);
      if(tick===photoTick && detail===photoLevel && speedMode===photoSpeed) return;
      photoTick=tick; photoLevel=detail; photoSpeed=speedMode;
      const w=Math.sin(tick/28*.72), z=Math.cos(tick/28*.72);
      // The optically thin corona and limb have their own local plasma motion.
      for (const s of solarSamples) {
        const flow=w*s.cosine+z*s.sine;
        const stretch=(s.rho-.94)*nativeSolarRadius*(.16+.15*detail)*flow;
        const x=clamp(s.x-stretch*s.nx,0,solarSize-2);
        const y=clamp(s.y-stretch*s.ny,0,solarSize-2);
        const ix=Math.floor(x), iy=Math.floor(y), fx=x-ix, fy=y-iy;
        const base=(iy*solarSize+ix)*2, stride=solarSize*2;
        for(let ch=0;ch<2;ch++) {
          const q=base+ch;
          const v=mix(mix(solarAtlas[q],solarAtlas[q+2],fx),
            mix(solarAtlas[q+stride],solarAtlas[q+stride+2],fx),fy);
          const out=solarLayers[ch+1].pixels.data, k=s.pixel, strength=v/255;
          out[k]=255;
          out[k+1]=ch===0 ? 127+95*strength : 67+95*strength;
          out[k+2]=speedMode===2 ? (ch===0?68:101)+62*strength : 28+43*strength;
          out[k+3]=v*(ch===0 ? .76+.22*detail : (.68+.31*detail)*(.83+.17*flow));
        }
      }
      for(let i=1;i<solarLayers.length;i++) solarLayers[i].ctx.putImageData(solarLayers[i].pixels,0,0);
    }


    const solarFraming = {x:0.78, y:0.54};

    function sol(alpha, time, approach = 1, withSky = true, view = null) {
      context.save();
      if (view) bendBelPlane(belStrain(1),view.centerX,view.centerY);
      context.globalAlpha = alpha;
      const pan = smooth(clamp(approach,0,1));
      const aim = pathPhase(approach,0.08,0.95);
      const approachScale = pathPhase(approach,0.10,1) ** 2;
      const retreat = view ? view.travel : 0;
      const corona = pathPhase(approach,0.43,0.82) * (1-pathPhase(retreat,0.18,0.63));
      const prominence = pathPhase(approach,0.64,0.96) * (1-pathPhase(retreat,0.035,0.37));
      const surfaceDetail = pathPhase(approach,0.44,0.86) * (1-pathPhase(retreat,0.12,0.56));
      if (withSky) drawSpaceBackdrop(alpha,time,0.62);
      const guide = projectSkyStar(0,time,0.13*pan);
      const x = view ? view.sunX : mix(guide.x,width*solarFraming.x,aim);
      const y = view ? view.sunY : mix(guide.y,height*solarFraming.y,aim);
      const farR = lunarField[0][2]*(0.86+0.14*intensity);
      const closeR = mix(farR,height*(0.26+intensity*0.075),approachScale);
      // Equal steps in camera distance scale the apparent disc exponentially.
      const starR = (0.82+intensity*0.23)*mix(1,.82,belMix);
      const r = view ? closeR*(starR/closeR)**smooth(retreat) : closeR;
      if (corona < 1) {
        context.globalAlpha = alpha * (1-corona)*0.46*mix(1,.86,belMix);
        radial(x,y,3.6+r-farR,"rgba(245,209,158,0.52)","rgba(245,209,158,0)");
      }
      const imageWidth = r * solarSize / nativeSolarRadius;
      const left = x-imageWidth/2, top = y-imageWidth/2;
      if (surfaceDetail>0 || corona>0 || prominence>0) updateSolarPhotos(time,intensity);
      const gold = Math.min(speedBlend,1), violet = Math.max(0,speedBlend-1);
      const lift = 0.27*gold + 0.34*violet;
      if (corona > 0) {
        context.save();
        const green = Math.round(142+57*gold-7*violet), blue = Math.round(54+27*gold+127*violet);
        const glow = "rgba(255,"+green+","+blue+",0.75)";
        context.globalAlpha=alpha*corona*(.23+.27*intensity+.19*gold+.22*violet);
        radial(x,y,r*(2.4+1.05*intensity+.34*speedBlend),glow,"rgba(151,55,22,0)");
        // A low oblique spill leaves most of the surrounding star field in shadow.
        context.translate(x-r*.25,y+r*.09);
        context.rotate(-0.23);
        context.scale(1,.42);
        radial(0,0,r*(4.4+.8*intensity+.48*speedBlend),glow,"rgba(123,53,48,0)");
        context.restore();
        context.globalAlpha=alpha*corona*(.56+.44*intensity);
        context.drawImage(solarCorona,left,top,imageWidth,imageWidth);
        if (lift>0) {
          context.save();
          context.globalCompositeOperation="screen";
          context.globalAlpha=alpha*corona*lift;
          context.drawImage(solarCorona,left,top,imageWidth,imageWidth);
          context.restore();
        }
      }
      if (prominence > 0) {
        context.globalAlpha=alpha*prominence*(.45+.55*intensity);
        context.drawImage(solarLimb,left,top,imageWidth,imageWidth);
      }
      const surface = context.createRadialGradient(x-r*0.22, y-r*0.24, 0, x, y, r);
      const sunTint = (g,b) => "rgb(255,"+Math.round(mix(228,g,surfaceDetail))+","+Math.round(mix(187,b,surfaceDetail))+")";
      surface.addColorStop(0, sunTint(246,191));
      surface.addColorStop(0.55, sunTint(223,124));
      surface.addColorStop(0.9, sunTint(183,68));
      surface.addColorStop(1, sunTint(139,56));
      context.globalAlpha = alpha*mix(0.96*(0.8+0.2*intensity),1,surfaceDetail);
      context.fillStyle = surface;
      context.beginPath();
      context.arc(x, y, r, 0, TAU);
      context.fill();
      if (surfaceDetail > 0) {
        context.globalAlpha=alpha*surfaceDetail;
        context.drawImage(solarSurface,left,top,imageWidth,imageWidth);
        if (lift>0) {
          // Screen-lift the measured texture itself: brighten the midtones and
          // active regions without flattening dark lanes or clipping highlights.
          context.globalCompositeOperation="screen";
          context.globalAlpha=alpha*surfaceDetail*lift;
          context.drawImage(solarSurface,left,top,imageWidth,imageWidth);
        }
      }
      context.restore();
    }

    const galaxyLights = [
      { field: [[0,"#254cc6"],[0.34,"#4d46bb"],[0.67,"#955ce0"],[1,"#494ab7"]],
        clouds: ["rgba(186,140,255,0.42)", "rgba(103,182,255,0.4)"], grains: ["#74c8ff", "#cf7dff", "#fff3d2"] },
      { field: [[0,"#172e55"],[0.34,"#66505a"],[0.64,"#b77336"],[1,"#2d2850"]],
        clouds: ["rgba(255,169,56,0.7)", "rgba(255,213,123,0.55)"], grains: ["#ffe3a5", "#ffbe68", "#fff3d2"] },
      { field: [[0,"#211552"],[0.34,"#512695"],[0.64,"#ac45c7"],[1,"#2b2467"]],
        clouds: ["rgba(193,94,255,0.66)", "rgba(142,120,255,0.54)"], grains: ["#ceacff", "#f993f6", "#d3edff"] }
    ];

    function galacticView(travel) {
      const t = smooth(travel);
      // Foreground detail recedes early. Distant disks travel through a much
      // smaller range of magnifications along this same reversible path.
      const wide = belScale**(belMix*(1.33-.33*belMix));
      const home = clusterPoint(astraOrbit,diskPhase);
      const angle = mix(-0.16,-0.29,belMix);
      const radius = width*0.62;
      const thickness = height*mix(0.19,0.83,belMix);
      // Sol has a permanent orbit in the outer disk, separate from the galactic nucleus.
      const longitude = diskPhase*0.86 - 0.36;
      const u = 0.54*radius*Math.cos(longitude);
      const v = 0.54*thickness*Math.sin(longitude);
      const dx = u*Math.cos(angle)-v*Math.sin(angle);
      const dy = u*Math.sin(angle)+v*Math.cos(angle);
      const focusX = mix(width*.54,home.x,belMix), focusY = mix(height*.5,home.y,belMix);
      const sunX = mix(width*solarFraming.x, focusX+wide*dx, t);
      const sunY = mix(height*solarFraming.y, focusY+wide*dy, t);
      const scale = 3.3**(1-t)*wide;
      return {travel, angle, radius, thickness, wide, scale, sunX, sunY, home,
        centerX:sunX-scale*dx, centerY:sunY-scale*dy};
    }

    function astra(alpha, time, view) {
      const travel = view.travel;
      const arrival = pathPhase(travel,0.20,0.97);
      if (travel < 1) drawSpaceBackdrop(1,time,0.62);
      if (arrival === 0) return;
      context.save();
      context.globalAlpha = alpha*arrival;
      gradient([[0, "#131a4e"], [0.42, "#26205c"], [0.72, "#3f296c"], [1, "#191948"]]);
      const light = galaxyLights[speedMode];
      const pullbackFade = speedMode ? 0.36 : 0.72;
      context.globalAlpha = alpha * (0.12 + intensity * 0.8) * arrival * (1 - belMix * pullbackFade);
      gradient(light.field);
      if (belMix > 0) {
        context.globalAlpha = belMix*(.94-.045*speedMode);
        gradient([[0,"#0a1324"],[.39,"#111b30"],[.71,"#1c1b33"],[1,"#0b1121"]]);
        // Two broad, fixed washes give the dark sky depth between the orbiting disks.
        context.save();
        bendBelPlane(.23*belStrain(.36),width*groupCenterX,height*groupCenterY);
        context.scale(width,height);
        context.globalAlpha = belMix;
        radial(.27,.76,.65,"rgba(78,124,141,.14)","rgba(78,124,141,0)");
        radial(.71,.16,.46,"rgba(139,100,147,.13)","rgba(139,100,147,0)");
        context.restore();
      }
      context.globalAlpha = alpha * pathPhase(travel,0.10,0.94);
      context.save();
      // A faint final deflection of distant starlight follows the resolved disks.
      bendBelPlane(.15*belStrain(.24),width*groupCenterX,height*groupCenterY);
      const distantScale = mix(1.46,1,smooth(travel));
      context.translate(width*0.54*(1-distantScale),height*0.5*(1-distantScale));
      context.scale(distantScale,distantScale);
      drawGalacticStars(time);
      context.restore();
      if (belMix && activationCue === "wave" && activationProgress < 1) drawBelWakefront(activationProgress);
      drawNeighborGalaxies(view);
      const galaxyRadius=view.radius, squash=view.thickness, orbitalPhase=diskPhase;
      bendBelPlane(belStrain(1),view.centerX,view.centerY);
      context.translate(view.centerX,view.centerY);
      context.scale(view.scale,view.scale);
      context.rotate(view.angle);
      context.globalCompositeOperation="lighter";

      // Layered radial color fields create a feathered band instead of a solid oval.
      context.save();
      context.scale(1, squash / galaxyRadius);
      const nebula = context.createRadialGradient(0, 0, 0, 0, 0, galaxyRadius);
      nebula.addColorStop(0, "rgba(225,238,255,0.54)");
      nebula.addColorStop(0.13, "rgba(92,183,255,0.32)");
      nebula.addColorStop(0.42, "rgba(104,94,245,0.25)");
      nebula.addColorStop(0.72, "rgba(181,83,255,0.12)");
      nebula.addColorStop(1, "rgba(60,56,180,0)");
      context.globalAlpha = alpha * arrival * (0.3 + intensity * 0.34);
      context.fillStyle = nebula;
      context.beginPath();
      context.arc(0, 0, galaxyRadius, 0, TAU);
      context.fill();
      context.restore();

      // Overlapping clouds give the band a soft, uneven edge at this small scale.
      context.save();
      context.scale(1, (squash / galaxyRadius) * 1.12);
      context.globalAlpha = alpha * arrival * (0.28 + intensity * 0.4 + belMix * 0.12);
      for (let index = 0; index < 7; index += 1) {
        const x = galaxyRadius * (index - 3) * 0.17;
        const y = Math.sin(index * 1.8 + orbitalPhase) * galaxyRadius * 0.08;
        radial(x, y, galaxyRadius * 0.24, index % 2 ? light.clouds[0] : light.clouds[1], "rgba(123,148,255,0)");
      }
      context.restore();

      for (const particle of dust) {
        const orbitRadius = galaxyRadius * (0.1 + Math.abs(particle.along) * 0.86);
        const orbit = particle.phase + orbitalPhase * (0.72 + particle.r * 0.12);
        const x = Math.cos(orbit) * orbitRadius;
        const taper = 1 - (orbitRadius / galaxyRadius) * 0.62;
        const y = Math.sin(orbit) * squash * (orbitRadius / galaxyRadius) + particle.across * squash * 0.18;
        const shimmer = media.matches ? 0.8 : 0.68 + Math.sin(time * 1.2 + particle.phase) * 0.22;
        context.globalAlpha = alpha * arrival * shimmer * (0.3 + intensity * 0.48) * taper;
        context.fillStyle = light.grains[particle.across > 0.1 ? 0 : particle.across < -0.1 ? 1 : 2];
        context.beginPath();
        context.arc(x, y, particle.r * (0.6 + intensity * 0.55), 0, TAU);
        context.fill();
      }

      // Ultra alone exposes long blue-violet spiral trails; lower modes retain dust and nebula.
      const trailStrength = smooth(clamp((intensity - 0.68) / 0.32, 0, 1));
      context.globalAlpha = alpha * arrival * trailStrength * 0.48 * (1 - belMix * 0.72);
      context.lineCap = "round";
      context.shadowBlur = 3.5;
      context.shadowColor = "#645dff";
      const trailColor = context.createLinearGradient(-width * 0.45, 0, width * 0.45, 0);
      trailColor.addColorStop(0, "rgba(92,161,255,0.08)");
      trailColor.addColorStop(0.34, "rgba(83,211,255,0.9)");
      trailColor.addColorStop(0.66, "rgba(158,113,255,0.86)");
      trailColor.addColorStop(1, "rgba(206,106,255,0.06)");
      for (let index = 0; index < 5; index += 1) {
        context.strokeStyle = trailColor;
        context.lineWidth = 0.38 + index * 0.11;
        const start = 0.28 + index * 1.19 + (media.matches ? 0 : time * 0.018);
        context.beginPath();
        context.ellipse(
          0,
          0,
          width * (0.09 + index * 0.078),
          squash * (0.5 + index * 0.34),
          0,
          start,
          start + 0.72 + index * 0.12
        );
        context.stroke();
      }
      context.shadowBlur = 0;

      if (speedMode) {
        const ultraFast = speedMode === 2;
        const speedTrail = context.createLinearGradient(-galaxyRadius, 0, galaxyRadius, 0);
        if (ultraFast) {
          speedTrail.addColorStop(0, "rgba(91,62,208,0.03)");
          speedTrail.addColorStop(0.38, "rgba(159,109,255,0.88)");
          speedTrail.addColorStop(0.72, "rgba(215,151,255,0.72)");
          speedTrail.addColorStop(1, "rgba(104,66,222,0.02)");
        } else {
          speedTrail.addColorStop(0, "rgba(222,157,56,0.02)");
          speedTrail.addColorStop(0.42, "rgba(255,214,103,0.86)");
          speedTrail.addColorStop(0.75, "rgba(255,181,71,0.62)");
          speedTrail.addColorStop(1, "rgba(213,139,44,0.02)");
        }
        context.globalAlpha = alpha * arrival * ((ultraFast ? 0.46 : 0.38) + belMix * (ultraFast ? 0.08 : 0.11));
        context.strokeStyle = speedTrail;
        context.shadowColor = ultraFast ? "#7141d8" : "#dba43e";
        context.shadowBlur = ultraFast ? 5 : 2;
        context.lineCap = "round";
        for (let streak = 0; streak < (ultraFast ? 5 : 3); streak += 1) {
          const start = orbitalPhase + flowPhase * 0.72 + streak * 1.31;
          context.lineWidth = (ultraFast ? 0.58 : 0.42) + streak * 0.05;
          context.beginPath();
          context.ellipse(
            0,
            0,
            galaxyRadius * (0.18 + streak * 0.12),
            squash * (0.28 + streak * 0.15),
            0,
            start,
            start + (ultraFast ? 1.16 : 0.5)
          );
          context.stroke();
        }
        for (let runner = 0; runner < 2; runner += 1) {
          const orbitScale = 0.44 + runner * 0.24;
          const runnerPhase = orbitalPhase + flowPhase * 0.72 + runner * Math.PI;
          const runnerX = Math.cos(runnerPhase) * galaxyRadius * orbitScale;
          const runnerY = Math.sin(runnerPhase) * squash * orbitScale;
          context.globalAlpha = alpha * arrival * (ultraFast ? 0.66 : 0.58);
          context.lineWidth = ultraFast ? 0.9 : 0.62;
          context.beginPath();
          context.ellipse(
            0,
            0,
            galaxyRadius * orbitScale,
            squash * orbitScale,
            0,
            runnerPhase - (ultraFast ? 1.02 : 0.44),
            runnerPhase
          );
          context.stroke();
          radial(
            runnerX,
            runnerY,
            ultraFast ? 5.8 : 4.2,
            ultraFast ? "rgba(220,176,255,0.9)" : "rgba(255,222,126,0.9)",
            ultraFast ? "rgba(116,65,220,0)" : "rgba(221,153,51,0)"
          );
          context.fillStyle = ultraFast ? "#e7c7ff" : "#ffe3a0";
          context.beginPath();
          context.arc(runnerX, runnerY, ultraFast ? 1.05 : 0.88, 0, TAU);
          context.fill();
        }
        context.shadowBlur = 0;
      }

      // Two faint arms reveal rotation in Astra; Bel resolves a third and the outer edge.
      {
        context.globalAlpha = alpha * arrival * belMix * 0.2;
        context.strokeStyle = "#7189e8";
        context.lineWidth = 0.45;
        context.beginPath();
        context.ellipse(0, 0, galaxyRadius, squash, 0, 0, TAU);
        context.stroke();

        const armColor = context.createLinearGradient(-galaxyRadius, 0, galaxyRadius, 0);
        armColor.addColorStop(0, "rgba(85,128,255,0.08)");
        armColor.addColorStop(0.38, "rgba(92,205,255,0.76)");
        armColor.addColorStop(0.62, "rgba(184,126,255,0.78)");
        armColor.addColorStop(1, "rgba(105,83,255,0.08)");
        context.strokeStyle = armColor;
        context.lineCap = "round";
        context.shadowBlur = 4;
        context.shadowColor = "#675fff";
        for (let arm = 0; arm < 3; arm += 1) {
          const armWeight = arm===2 ? belMix : mix(0.42,1,belMix);
          if (armWeight===0) continue;
          const knotStep = 19 + arm * 3;
          let knotX = 0, knotY = 0;
          context.globalAlpha = alpha * arrival * belMix * (0.48 + arm * 0.04);
          // Keep the blue-violet arms resolved even as the disk becomes tiny.
          context.lineWidth = .58+arm*.08 + belMix*.50/view.wide;
          context.beginPath();
          for (let step = 0; step <= 34; step += 1) {
            const progress = step / 34;
            const radius = galaxyRadius * (0.055 + progress * 0.9);
            const phase = orbitalPhase + arm * TAU / 3 + progress * TAU * 1.28;
            const x = Math.cos(phase) * radius;
            const y = Math.sin(phase) * squash * (radius / galaxyRadius);
            if (step === knotStep) {
              knotX = x;
              knotY = y;
            }
            if (step === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.stroke();
          // Bright knots on the spiral arms make their displacement easy to follow.
          context.globalAlpha = alpha * arrival * armWeight * (0.72 + intensity * 0.26);
          const knotColor = ["#ffe0a1", "#bceeff", "#dfb6ff"][arm];
          const knotRadius = mix(3.3+intensity,1.60/view.wide,belMix);
          radial(knotX, knotY, knotRadius, knotColor, "rgba(135,130,245,0)");
          context.fillStyle = knotColor;
          context.beginPath();
          context.arc(knotX,knotY,knotRadius*.30,0,TAU);
          context.fill();
        }
        context.shadowBlur = 0;
      }

      // The unresolved cluster is a soft nucleus; the solar disc is drawn only by sol().
      context.globalAlpha = alpha * pathPhase(travel,0.34,0.94);
      const coreLight = ["rgba(224,244,255,0.82)","rgba(255,222,137,0.9)","rgba(218,181,255,0.9)"][speedMode];
      radial(0,0,height*0.35,coreLight,"rgba(119,91,255,0)");
      radial(0,0,height*0.13,"rgba(255,250,228,0.85)","rgba(193,196,255,0)");
      context.restore();
    }

    const meteorHues = ["#9bdcff", "#ffd174", "#cfa1ff"];

    function drawMeteor(progress) {
      const quiet = media.matches;
      if (progress <= 0 || progress >= 1) return;

      const startX = width * (quiet ? 0.25 : 0.025);
      const endX = width * 0.975;
      const startY = height * 0.12;
      const galaxy = smooth(clamp(position - 2, 0, 1));
      const endY = height * (0.42 + 0.32 * galaxy);
      const x = mix(startX, endX, progress), y = mix(startY, endY, progress);
      const solarGlare = pathPhase(position,1.28,2)*(1-pathPhase(position,2.02,2.63));
      const tailLength = (quiet ? 0.16 : 0.24 + speedMode*0.035)*(1-0.22*solarGlare);
      const tail = Math.max(0, progress-tailLength);
      const tx = mix(startX, endX, tail), ty = mix(startY, endY, tail);
      const opacity = smooth(clamp(progress / 0.12, 0, 1)) * smooth(clamp((1 - progress) / 0.22, 0, 1));
      const hue = meteorHues[speedMode];
      const trail = context.createLinearGradient(tx, ty, x, y);
      trail.addColorStop(0, hue + "00");
      trail.addColorStop(0.58, hue + "80");
      trail.addColorStop(1, "#fffef9");

      context.save();
      context.globalAlpha = opacity * (quiet ? 0.73 : 0.97) * (1-0.48*solarGlare);
      context.fillStyle = trail;
      context.shadowColor = hue;
      context.shadowBlur = (quiet ? 2 : 4)*(1-0.55*solarGlare);
      context.beginPath();
      context.moveTo(tx, ty);
      context.lineTo(x, y - 0.9);
      context.lineTo(x, y + 0.9);
      context.closePath();
      context.fill();
      context.fillStyle = "#fffdf5";
      context.beginPath();
      context.arc(x, y, 1.25, 0, TAU);
      context.fill();
      context.restore();
    }

    // In the activated Bel scene these tempos give 24, 18 and 14 seconds per turn.
    const speedScales = [1, 24 / 18, 24 / 14];

    function render(now) {
      const elapsed = enabled && lastFrameAt !== null
        ? clamp((now - lastFrameAt) / 1000, 0, 0.15) : 0;
      const ultra = intensity === 1;
      if (ultra && activationProgress < 1) {
        const duration = media.matches ? 1.65 : (activationCue === "wave" ? 1.25 : 1.08);
        activationProgress = Math.min(1, activationProgress + elapsed/duration);
        if (activationCue === "wave") wake = pathPhase(activationProgress,.14,.89);
      } else if (ultra) {
        wake = Math.min(1, wake + elapsed / 0.55);
      }

      // Before activation Bel already rotates. The other scenes rest while the
      // meteor crosses, and keep a gentle idle flow if lightning is enabled below Ultra.
      const idle = mix(!ultra && speedMode ? 0.3 : 0, 24 / 50, belMix);
      const targetTempo = mix(idle, 1, smooth(wake)) * speedScales[speedMode];
      tempo = mix(tempo, targetTempo, 1 - Math.exp(-elapsed / 0.22));
      if (Math.abs(targetTempo - tempo) < 0.001) tempo = targetTempo;
      // Either lightning mode enables the spin immediately. At normal speed,
      // Ultra enables it only once the flyby finishes; all other levels hold longitude.
      if (speedMode !== 0 || (ultra && wake > 0)) {
        const spinTarget = (speedMode ? 1 : smooth(wake)) * speedScales[speedMode] / 24;
        solarRate = mix(solarRate, spinTarget, 1 - Math.exp(-elapsed / 0.22));
        solarTurns += elapsed * solarRate * (media.matches ? 0.38 : 1);
      } else {
        solarRate = 0;
      }
      speedBlend = mix(speedBlend,speedMode,1-Math.exp(-elapsed/0.15));
      if (Math.abs(speedMode-speedBlend)<0.002) speedBlend=speedMode;
      const step = elapsed * tempo * (media.matches ? 0.38 : 1);
      sceneTime += step;
      flowPhase = sceneTime * 0.69;
      diskPhase += step * (TAU / 24) * mix(0.55, 1, belMix);
      // At rest in Luna the distant sky keeps a quiet rotation, independently
      // of the Ultra surface animation. Held scrubs preserve the reversible camera path.
      const restingAtLuna = position === 1 && !scrubbing && !media.matches;
      if (restingAtLuna) lunarIdleTime += elapsed * Math.max(0, 0.30-tempo);
      // Once the disk is visible, it turns even if the user holds the slider
      // still. This is world motion; the camera itself has no timed playback.
      const quietOrbit = media.matches ? 0 : 0.064*pathPhase(position,2.44,2.94)*speedScales[speedMode];
      const drivenOrbit = tempo*(TAU/24)*mix(0.55,1,belMix);
      diskPhase += elapsed*Math.max(0,quietOrbit-drivenOrbit);
      const moving = enabled && (ultra || targetTempo > 0 || tempo > 0 || speedBlend !== speedMode || restingAtLuna || quietOrbit > 0);
      lastFrameAt = moving ? now : null;
      fit();
      const time = sceneTime;
      context.setTransform(ratio,0,0,ratio,0,0);
      context.clearRect(0,0,width,height);
      const view = position > 2 ? galacticView(position-2) : null;
      if (view) {
        astra(1,time,view);
      } else if (position < 0.83) {
        terra(1,time,position);
      } else {
        const warmth=mix(0.08,0.62,pathPhase(position,1,2));
        drawSpaceBackdrop(1,time,warmth);
      }

      // Paint the meteor in distant space. The lit disc, its dark limb and
      // off-limb emissions are then composited over both its head and its trail.
      if (ultra && activationCue === "meteor" && activationProgress < 1) drawMeteor(activationProgress);
      if (position > 1) sol(1,time,Math.min(position-1,1),false,view);
      if (position > 0.53 && position < 2) {
        const approach=clamp((position-0.53)/0.47,0,1);
        luna(1,time,approach,Math.max(0,position-1),false);
      }
      if (belMix > 0) {
        context.fillStyle = `rgba(0,0,0,${0.08 * belMix})`;
        context.fillRect(0, 0, width, height);
      }

      // A restrained glass sheen preserves the capsule's tactile depth.
      const sheen = context.createLinearGradient(0, 0, 0, height);
      sheen.addColorStop(0, "rgba(255,255,255," + mix(.18,.055,belMix) + ")");
      sheen.addColorStop(0.42, "rgba(255,255,255,0.02)");
      sheen.addColorStop(1, "rgba(0,0,0,0.16)");
      context.fillStyle = sheen;
      context.fillRect(0, 0, width, height);

      if (moving) frame = requestAnimationFrame(render);
      else frame = 0;
    }

    function requestRender() {
      if (!frame) frame = requestAnimationFrame(render);
    }

    function onMotionChange() {
      if (enabled) requestRender();
    }

    if (media.addEventListener) media.addEventListener("change", onMotionChange);
    else media.addListener(onMotionChange);
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(requestRender);
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener("resize", requestRender, { passive: true });
    }
    requestRender();

    return {
      set(nextPosition, nextExposure, nextSpeedMode, railHeld = false, selectedFamily = Math.round(nextPosition)) {
        scrubbing = railHeld;
        const trackPosition = clamp(Number(nextPosition) || 0, 0, 4);
        position = Math.min(trackPosition, 3);
        belMix = smooth(Math.max(0, trackPosition - 3));
        const exposure = clamp(Number(nextExposure) || 0, 0, 1);
        const cue = selectedFamily === 4 ? "wave" : "meteor";
        if (exposure !== 1) {
          activationProgress = 1;
          wake = 0;
        } else if (intensity !== 1) {
          activationCue = cue;
          activationProgress = 0;
        } else if (cue !== activationCue) {
          activationProgress = 1;
        }
        intensity = exposure;
        speedMode = clamp(Math.round(Number(nextSpeedMode) || 0), 0, 2);
        requestRender();
      },
      active(nextActive) {
        const shouldEnable = Boolean(nextActive);
        if (enabled === shouldEnable) return;
        if (!shouldEnable) {
          enabled = false;
          if (frame) cancelAnimationFrame(frame);
          frame = 0;
          lastFrameAt = null;
          return;
        }
        enabled = true;
        lastFrameAt = null;
        requestRender();
      },
    };
  };
})();
