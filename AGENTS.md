# 项目规则

- **管理界面只放管理页面，不放公共页面。** 状态管理、内容编辑这类管理员操作统一收进管理工作台（`/admin`、`/admin/status`、`/problems/admin`、`/editorials/admin`、`/camps/admin`、`/posts/admin`），公共页面（`/status`、`/camps`、首页等）只读展示，不挂编辑入口。
- **新建/添加按钮放内容区，不放顶部导航。** 管理工作台导航（`AdminWorkspaceNav`）的插槽只放页面级操作（刷新、清理缓存这类）；「新建」「添加」按钮放在对应内容卡片或列表的标题旁。刷新按钮统一用 `ui/RefreshButton.vue`。管理页面宽度统一 `max-w-6xl`。
