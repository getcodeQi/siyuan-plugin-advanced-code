# Advanced Code for SiYuan

Advanced Code 为思源提供基于 CodeMirror 6 的多 Tab 代码块。它可以把思源原生代码块转换为 Advanced Code，并支持转回原生 fenced code block。

## 功能

- CodeMirror 6 编辑体验：行号、历史、折叠、缩进和常用语言高亮。
- 将选中的思源原生代码块转换为 Advanced Code，保留代码和语言。
- 将 Advanced Code 转回原生代码块；多 Tab 会在可插入的位置恢复为相邻原生代码块。
- Tab 新增、删除、切换、改名和拖动排序。
- Slash 命令、命令面板命令和块菜单入口。
- 当前文档可见范围内的批量双向转换命令。
- 浅色/深色主题、自适应高度、完整圆角边框和移动端布局。

## 已知边界

思源官方 API 文档目前说明 `/api/transactions` 属内部实现。本插件使用官方 kernel 的块更新/插入接口和块属性接口；这些接口可以可靠完成数据转换，但当前版本不伪造“单次撤销”保证。批量转换会逐块执行，撤销粒度取决于思源当前版本的内核历史实现。

暂不实现代码内挖空。思源 fenced code block 内的 `==标记==` 是普通代码文本，不是原生挖空语义。
