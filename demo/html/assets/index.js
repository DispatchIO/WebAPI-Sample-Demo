// 服务器ip地址
var serverAddr = "https://120.26.125.181";

var client = DispRTC.createClient({
  server: serverAddr,
  //方便本地文件打开，才保存到localStorage
  token: localStorage.getItem("DispRTC-token"),
});

// 手柄号
let mainTel;

let token, cc, rtcStream;

// 手柄是否注册，默认否
let sip_num_flag = false;
