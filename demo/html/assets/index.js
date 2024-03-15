// 服务器ip地址
var serverAddr = "https://120.26.125.181";

var client = DispRTC.createClient({
  server: serverAddr,
  //直接本地打开sessionStorage中获取不到值，现在把他保存到localStorage中
  token: sessionStorage.getItem("DispRTC-token")
    ? JSON.parse(sessionStorage.getItem("DispRTC-token")).content
    : localStorage.getItem("DispRTC-token"),
});

// 手柄号
let mainTel;

let token, cc, rtcStream;

// 手柄是否注册，默认否
let sip_num_flag = false;
