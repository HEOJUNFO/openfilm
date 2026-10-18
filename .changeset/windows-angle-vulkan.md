---
'openfilm': patch
---

On Windows, render, look and Studio draw WebGL on the GPU. Headless Chromium picked no graphics backend there and fell back to SwiftShader, which draws on the CPU; it now starts with Vulkan, reads the renderer once, and keeps Chromium's default when Vulkan doesn't start or is software too (a virtual machine, a CI runner, a computer without a Vulkan driver).
