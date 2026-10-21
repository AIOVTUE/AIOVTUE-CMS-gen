import type { NavMenuItem } from "@/components/site-settings/nav-menu-field";

/** Theme default for `params.menu.main` (matches hugo-blog-aiovtue/hugo.toml). */
const DEFAULT_NAV_MENU: NavMenuItem[] = [
  {
    name: "首页",
    url: "/",
    icon: "ant-design:home-filled",
    color: "",
    navGroup: "",
    weight: 1,
    enabled: true,
    items: [],
  },
  {
    name: "文章",
    url: "/categories/",
    icon: "ant-design:read-filled",
    color: "",
    navGroup: "posts",
    weight: 2,
    enabled: true,
    items: [
      {
        name: "分类",
        url: "/categories/",
        icon: "ant-design:appstore-filled",
        color: "",
        enabled: true,
      },
      {
        name: "归档",
        url: "/archives/",
        icon: "ant-design:container-filled",
        color: "",
        enabled: true,
      },
      {
        name: "标签",
        url: "/tags/",
        icon: "ant-design:tags-filled",
        color: "",
        enabled: true,
      },
      {
        name: "统计",
        url: "/stats/",
        icon: "ri:bar-chart-2-line",
        color: "",
        enabled: true,
      },
    ],
  },
  {
    name: "周刊",
    url: "/posts/weekly/",
    icon: "ant-design:file-text-filled",
    color: "",
    navGroup: "",
    weight: 3,
    enabled: true,
    items: [],
  },
  {
    name: "个人",
    url: "/moments/",
    icon: "ant-design:user-outlined",
    color: "",
    navGroup: "personal",
    weight: 4,
    enabled: true,
    items: [
      {
        name: "相册",
        url: "/gallery/",
        icon: "ant-design:picture-filled",
        color: "",
        enabled: true,
      },
      {
        name: "动态",
        url: "/moments/",
        icon: "ant-design:compass-filled",
        color: "",
        enabled: true,
      },
      {
        name: "回忆",
        url: "/memories/",
        icon: "ri:heart-2-line",
        color: "",
        enabled: true,
      },
      {
        name: "追番",
        url: "/bangumi/",
        icon: "mdi:television-play",
        color: "",
        enabled: true,
      },
      {
        name: "音乐",
        url: "/music/",
        icon: "ri:music-2-fill",
        color: "",
        enabled: true,
      },
    ],
  },
  {
    name: "互动",
    url: "/links/",
    icon: "ri:chat-smile-2-fill",
    color: "",
    navGroup: "interact",
    weight: 5,
    enabled: true,
    items: [
      {
        name: "友链",
        url: "/links/",
        icon: "ant-design:link-outlined",
        color: "",
        enabled: true,
      },
      {
        name: "友文",
        url: "/friend-articles/",
        icon: "ant-design:read-filled",
        color: "",
        enabled: true,
      },
      {
        name: "留言",
        url: "/comment/",
        icon: "ant-design:message-filled",
        color: "",
        enabled: true,
      },
    ],
  },
  {
    name: "关于",
    url: "/about/",
    icon: "ant-design:idcard-filled",
    color: "",
    navGroup: "",
    weight: 6,
    enabled: true,
    items: [],
  },
];

const cloneDefaultNavMenu = (): NavMenuItem[] =>
  JSON.parse(JSON.stringify(DEFAULT_NAV_MENU)) as NavMenuItem[];

export { DEFAULT_NAV_MENU, cloneDefaultNavMenu };
