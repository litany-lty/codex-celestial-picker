# Codex 天象模型选择器

从 Terra 的地平线拖到 Luna，掠过 Sol，拉远到 Astra 的旋臂，再进入 Bel 的星系群。松手会吸附到最近的模型，反向拖动会沿原镜头路径返回。这个独立的中文浏览器原型复现了 Codex 新窗口的输入框和模型入口，使用本地演示数据。Bel 及其版本为设计演示设定。

## 运行

下载并解压仓库，或执行以下命令。

```sh
git clone https://github.com/litany-lty/codex-celestial-picker.git
cd codex-celestial-picker
```

用桌面浏览器打开根目录的 **index.html**，点击输入框右下角的 **GPT-6.2 Astra Ultra**。页面使用原生 JavaScript、CSS 和 Canvas 2D，支持离线运行。模型设置只在当前页面中生效。

## 操作

| 控件 | 操作 |
| --- | --- |
| 模型滑轨 | 拖动预览五个模型，松手选定。点模型名刻度可以直接跳转。 |
| 强度旋钮 | 点击选择 Low、Medium、High、Extra、Max 或 Ultra。向上或右滑提高，向下或左滑降低。 |
| 顶部模型与版本 | 点模型名打开完整目录，点短横线右侧的数字查看本模型版本。切回时会记住本页内的版本选择。 |
| 闪电 | 点击在常速、黄色 Fast、紫色 Ultra Fast 间循环，调整动效速度与光感。 |
| 键盘 | 滑轨或旋钮获得焦点时用方向键逐档调整，Home / End 跳至两端。Esc 逐层收起菜单。 |
| 还原 | 右上角的还原按钮恢复默认演示设置。 |

在 Luna 或 Sol 从 Max 升到 Ultra，可以看到一次从天体后方掠过的流星。在 Bel 做同样的操作，震荡波会依次带亮星系旁的星流。三档闪电可以在同一位置比较。页面也会响应系统的减少动态效果设置。

## 源码

- `index.html` 和 `src/styles.css` 提供新窗口、输入框和浮层布局。
- `src/controls.js` 管理模型、版本、强度、输入手势与键盘操作。
- `src/scene.js` 绘制同一条可往返的天象镜头；`assets/sky-textures.js` 提供本地月面和太阳纹理。

## 制作 58 秒的演示视频

这是可选步骤。准备 Python 3.11+、Google Chrome 和带有 H.264/AAC 编码器的 FFmpeg（含 ffprobe），然后在仓库根目录运行：

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-media.txt
python tools/build_demo.py
```

输出为 `build/codex-model-picker-58s.mp4`，1920×1080、25 fps。画面全程固定展示完整编辑器，`tools/score58.py` 合成与三次 Bel 激活动作同步的原创纯器乐《地平线之外》。可通过 `python tools/build_demo.py --help` 查看输出路径和浏览器选项。

## 授权

本项目为独立交互设计原型。原创代码采用 [MIT 许可证](LICENSE)。天文素材的署名、来源和产品名称说明请见 [第三方素材说明](THIRD_PARTY_NOTICES.md)。
