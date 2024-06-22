// 服务器ip地址
var serverAddr = "https://120.26.125.181";
var ttsServer = "https://120.26.125.181/tts";

/**
 * 子页面名称
 */
var subname = "";

//发送消息到首页
const sendMsgToOpener = (data = {}) => {
  if (window.opener && !window.opener.closed) {
    data.name = subname;
    window.opener.postMessage(data, "*");
  } else {
    window.close();
  }
};

/**
 * 增加页面监听事件
 *
 */
const handleAddListener = () => {
  console.log("addListener");
  //关闭或刷新时触发
  window.addEventListener("beforeunload", () =>
    sendMsgToOpener({
      type: "update_token",
      token: sessionStorage.getItem("DispRTC-token")
        ? JSON.parse(sessionStorage.getItem("DispRTC-token")).content
        : "",
    })
  );
};

/**
 * 跳转到登录页面
 */
const goToLogin = () => {
  if (subname !== "basic/login.html") {
    DispRTC.destroy();
    window.close();
    sendMsgToOpener({ type: "login" });
    return;
  }
};

/**
 * 该方法主要用来获取token
 * DispRTC-token由sdk维护
 * 实际使用中同一个页面共享sessiong, 在sdk里面统一处理token,不需要自己单独处理；
 * 这里是独立的页面，所以需要自己处理token
 */
const initData = () => {
  var query = window.location.search.substring(1);
  var params = new URLSearchParams(query);

  subname = params.get("name");

  //优先获取sdk的token,因为第一次肯定是空的
  var token = sessionStorage.getItem("DispRTC-token");
  if (!token) {
    //不存在，获取url传过来的token

    token = params.get("token");
    //参数中也不存在，如果不是登录页面，就去登录页面，并关闭该页面
    if (!token) {
      if (subname !== "basic/login.html") {
        goToLogin();
        return;
      }
    }
  } else {
    //sdk的token
    token = JSON.parse(sessionStorage.getItem("DispRTC-token")).content;
  }
  //创建sdk客户端
  var client = DispRTC.createClient({
    server: serverAddr,
    token: token,
    // isSse: true, //使用SSE方式接收状态事件时，需要设置isSse为true
  });

  handleAddListener();
};

/**
 * 页面加载时执行
 */
initData();
