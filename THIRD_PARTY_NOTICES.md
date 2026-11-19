# Third-Party Notices

This file covers third-party visual material embedded in or displayed by this project. The project's MIT License applies to the project code only. It does not grant rights in the imagery, data, names, logos, or trademarks identified below.

## NASA Scientific Visualization Studio — CGI Moon Kit

The lunar surface texture stored in `assets/sky-textures.js` and rendered by `src/scene.js` is a reduced, luminance-only derivative of the LROC WAC lunar color mosaic distributed with NASA's **CGI Moon Kit**. The project resamples the map into a small runtime texture and applies its own lighting, projection, rotation, color treatment, and animation.

- Source: [NASA Scientific Visualization Studio, “CGI Moon Kit”](https://svs.gsfc.nasa.gov/4720/)
- Source item credit requested by the official page: **NASA's Scientific Visualization Studio**
- Official page credits: visualization by Ernie Wright (STC); scientist Noah Petro (NASA/GSFC)
- Underlying dataset identified by the official page: **LROC WAC Color Mosaic (Natural Color Hapke Normalized WAC Mosaic)**, collected by Arizona State University using the Lunar Reconnaissance Orbiter Camera

The source mosaic is observation-derived. The small rendered Moon, its lighting, apparent motion, and animation in this project are simulated presentation effects and are not a live lunar observation or a scientific data product.

## NASA Solar Dynamics Observatory — AIA 171 Å and 304 Å

The solar textures stored in `assets/sky-textures.js` and rendered by `src/scene.js` are transformed derivatives of two full-disc extreme-ultraviolet images from NASA's Solar Dynamics Observatory Atmospheric Imaging Assembly (SDO/AIA):

- Source page: [NASA Goddard SDO, “The Sun Now”](https://sdo.gsfc.nasa.gov/data/)
- AIA 171 Å source URL: [latest_1024_0171.jpg](https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0171.jpg)
- AIA 304 Å source URL: [latest_1024_0304.jpg](https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0304.jpg)
- Credit: **NASA/SDO/AIA**
- Captured source-frame labels: **2026-11-19 21:07:46 UT** (171 Å) and **2026-11-19 21:08:30 UT** (304 Å)

The mutable `latest_*` URLs may now return newer observations. The timestamps above identify the frames used for this project's embedded derivatives.

The embedded solar material is modified as follows:

- the full-disc observations are normalized, gamma-adjusted, resampled, reduced to compact brightness/emissivity data, and false-colored at runtime;
- the near-side solar surface texture is observation-derived;
- the unobserved far-side texture is a deterministic, seamless statistical simulation based on the observed texture distribution, not an observation;
- apparent rotation, differential rotation, plasma flow, corona movement, prominences, speed effects, and camera motion are simulated presentation effects;
- the result is not a current live image, a predictive far-side map, or a scientific data product.

## NASA media-use conditions

Use of the NASA-derived material above is subject to NASA's current [Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). Those guidelines require NASA to be acknowledged as the source for qualifying uses and prohibit explicit or implicit NASA endorsement. They also explain that some material appearing on NASA websites may be third-party copyrighted material and that NASA's own use does not transfer third-party rights.

This notice therefore does **not** state that all NASA-hosted files are in the public domain. NASA insignia, logotypes, identifiers, and other protected marks are not licensed by the project's MIT License. No NASA insignia or logotype is intentionally included in the embedded lunar or solar texture data.

The scoped source pages above provide downloads and attribution instructions, and no item-specific no-redistribution notice was found for these two source items. Commercial, promotional, merchandise, or endorsement-sensitive uses may require a separate rights review under NASA's current guidelines.

## Product names and the welcome icon

Codex and OpenAI are product and company names used to identify the interface explored by this independent prototype. The welcome icon in `assets/terminal.svg` is an original drawing of a terminal prompt. The MIT license grants no trademark rights. See the [OpenAI brand guidelines](https://openai.com/brand/).

## Procedural and simulated visuals

The remaining stars, terrain, atmospheric lighting, galaxy structures, transitions, and motion effects in `src/scene.js` are programmatically drawn or simulated by the project. They should not be described as measured astronomy, live telemetry, or NASA imagery merely because they appear beside the NASA-derived Moon and Sun textures.

No endorsement by NASA, Arizona State University, OpenAI, or any named contributor is implied.
