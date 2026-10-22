<p align="center">
  <a href="https://aiovtue.yybb.us/cms/overview">
    <img src="https://aiovtue.yybb.us/logo.webp" width="92" alt="AIOVTUE-CMS-gen logo" />
  </a>
</p>

<h1 align="center">AIOVTUE-CMS-gen</h1>

<p align="center">
  <strong>AIOVTUE-CMS 是一款可免费自托管的内容管理系统 , 通过连接github仓库实现任何静态仓库的后台管理器</strong>
</p>
<p align="center">
  通过连接github仓库，编辑仓库文件并发布更改，实现静态博客后台效果，给你动态博客一般的体验
</p>
<p align="center">
  <a href="https://daily.yybb.us">前往博客</a> ·
  <a href="https://aiovtue.yybb.us/cms/overview">文档</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#使用教程">使用教程</a> 
</p>
<p align="center">⭐ 如果 AIOVTUE-CMS-GEN 对你有帮助，欢迎<a href="https://github.com/AIOVTUE/AIOVTUE-CMS-gen">点个 Star</a>。</p>

---

### 简介
*AIOVTUE-CMS-gen* 是基于开源项目[Pages CMS](https://pagescms.org/) 深度定制魔改的个人博客后台管理项目，主要部署在vercel平台，简化了部署流程和使用体验，深度定制界面ui，项目包含深度定制版和普适版，本项目为普适版，通过自定义文件路径和模版进行配置，理论上支持任何github仓库实现任何架构的后台管理
### 界面预览
![](https://aiovtue.yybb.us/cms/1.webp)
![](https://aiovtue.yybb.us/cms/3.webp)
![](https://aiovtue.yybb.us/cms/4.webp)

### 快速开始
本文说明如何将 **AIOVTUE-CMS-gen**（通用版，仓库 [AIOVTUE-CMS-gen](https://github.com/AIOVTUE/AIOVTUE-CMS-gen)）部署到本地或服务器。定制版见 [部署-定制版](https://aiovtue.yybb.us/cms/deploy)

#### 系统要求
- **Node.js** 20+（建议 LTS）
- **PostgreSQL** 16+（推荐）
#### 一、环境变量
环境变量只需要配置两个，即数据库和秘钥，其他配置均在网页内完成

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串，例如 `postgresql://user:pass@host:5432/pagescms` |
| `CRYPTO_KEY` | 用于加密 DB 内密钥的主密钥；即一串随机的字符串 

#### 部署到Vercel
本项目推荐使用vercel部署，vercel提供免费数据库，直接使用方便部署，下面是部署教程
#### Fork仓库
首先fork一份仓库到自己的github，[点我跳转开源仓库](https://github.com/AIOVTUE/AIOVTUE-CMS-gen)
![](https://aiovtue.yybb.us//cms/6.webp)
##### Vercel新建项目
登陆vercel，点击新建项目，选择刚才fork的*AIOVTUE-CMS-gen*项目
![](https://aiovtue.yybb.us//cms/7.webp)

在这个配置界面，只需要配置环境变量`CRYPTO_KEY`即可，随机输入一串长字符串即可，可以用一些随机字符串生成器，例如[这个](https://www.jyshare.com/front-end/9111/), 此界面不需要配置其他东西，数据库环境变量稍后配置，直接点击部署即可，应该是会失败报错的，不用管，直接下一步就行，只要创建好了即可（其实可以点取消部署来着，或者直接不部署也行，因为反正部署了也会失败）
![](https://aiovtue.yybb.us//cms/8.webp)

接下来回到主页，找到刚才部署的项目，如果没有可以刷新一下，一般长这样，接着先不进入，先点击这个*储存*，即创建和连接数据库，选择图中这个`Neon`即可，其实只要是postgres都行，选择后默认使用他的免费方案即可，然后点击创建，创建完后会让你选择连接到一个项目，选择我们刚才创建的项目即可，会自动帮我们配置环境变量
![](https://aiovtue.yybb.us//cms/9.webp)
![](https://aiovtue.yybb.us//cms/11.webp)
![](https://aiovtue.yybb.us//cms/12.webp) 

接着我们回到我们的项目中，点进去看一下环境变量，会发现多出了很多变量，这即是刚才连接的数据库，其实用不到这么多变量来着，不过绑着也没啥问题，这时候点击部署，重新部署一下即可
![](https://aiovtue.yybb.us//cms/13.webp) 
![](https://aiovtue.yybb.us//cms/14.webp) 

部署完成后访问链接，会进入初始化步骤，设置账号密码比较简单，不赘述
![](https://aiovtue.yybb.us//cms/15.webp) 

接下来会需要配置github app，就像这样,这里先不急，先看后边，带大家获取一下对应的信息，先打开我们的github，进入设置页面，点击开发者设置，或者[点我跳转](https://github.com/settings/apps), 点击新建一个app，注意是`github apps`而不是`oauth apps`
![](https://aiovtue.yybb.us//cms/16.webp) 
![](https://aiovtue.yybb.us//cms/17.webp)

APP的名字可以随意，接着是`Homepage URL`填项目访问地址，`Redirect URI`的后缀是`/api/auth/callback/github`即 `https://your.com/api/auth/callback/github`
![](https://aiovtue.yybb.us//cms/18.webp)

接着Webhook URL后缀`/api/webhook/github`, 即`https://your.com/api/webhook/github`, 然后在填一下密码，自己设置即可，后面要填，需要记住
![](https://aiovtue.yybb.us//cms/19.webp)

接下来权限配置部分，需要开启仓库读写权限，如图所示，选择`read and write`，最后点击底部的保存即可
![](https://aiovtue.yybb.us//cms/21.webp)
![](https://aiovtue.yybb.us//cms/20.webp)

保存后在这个页面可以得到`APP ID`, `Client ID`, 以及`APP名称`, 名称就是url后缀上那个，例如`https://github.com/settings/apps/aiovtue-cms-gen`的名称就是`aiovtue-cms-gen`
![](https://aiovtue.yybb.us//cms/22.webp)

接着在`Credentials`页面获取`client sevrets`和`ket pairs`，其中`ket pairs`就是`私钥PEM`，是一个文件，下载下来之后打开全部复制上去即可，具体可以参考图片，填上之后保存即可
![](https://aiovtue.yybb.us//cms/23.webp)
![](https://aiovtue.yybb.us//cms/24.webp)

初始化完成后，可以通过邮箱或者直接使用github登陆，登陆后需要安装github app，点击这个，根据步骤安装即可，根据自己的需求，在安装界面选择读取单个储存库还是完全运行，看自己需求
![](https://aiovtue.yybb.us//cms/25.webp)

安装完github app后，这个按钮会变成打开仓库，现在点击就可以选择自己的仓库进行管理了，部署到这里就结束啦
![](https://aiovtue.yybb.us//cms/26.webp)

### 使用教程
选择好管理的仓库后，会进入后台页面，在这里需要配置需要管理的文件或文件夹，点击添加页面，选择对应的模板，主要有以下模板：
- 源文件（即编辑和展示单个文件的源文件）
- 源文件夹（即按文件夹的形式展示，通常用于文章管理，支持配置新建文件的模板，方便快速新建文章）
- 多源文件（依旧是源文件，区别是可以选择多个源文件统一管理，适合管理各个页面的索引文件）
- 友链（此模板将友链进行可视化展示，由于适配难度太大，各个项目文件区别过大，只有部分适配，因此可能并不普适）
- 文章（此模板同源文件夹模板，略微区别，如果能适配的话也是不错的选择）

按需选择即可，一般使用源文件夹和源文件即可，可以自定义图标和图标的颜色，选择自己需要修改的文件，例如配置文件，页面文件，友链文件，或者是文章的文件夹等等
![](https://aiovtue.yybb.us//cms/27.webp)

除此之外，还有一些其他的配置，在设置页面，入口在左下角，进入后可以配置`AIOVTUE-analytics`、`AIOVTUE-memos`、`Twikoo`等，同时，设置页面还有一个设置返回站点的功能，输入你的前端网站地址，会在侧边栏顶部新增一个返回站点的按钮，方便来回跳转，其他的就留给大家自己摸索了
![](https://aiovtue.yybb.us//cms/28.webp)
