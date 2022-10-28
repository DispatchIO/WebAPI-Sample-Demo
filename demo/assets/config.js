// 手柄号
let mainTel;

// 服务器ip地址
let serverAddr = "120.26.125.181";

let token,cc,rtcStream;

// 手柄是否注册，默认否
let sip_num_flag = false;

try {
    sessionStorage.setItem("DispRTC-token", $.cookie("DispRTC-token"))
    // 设置token
    token = JSON.parse($.cookie("DispRTC-token")).content;
    cc = DispRTC.createClient({ "server": "https://" + serverAddr, "token": token });
    rtcStream = new DispRTC.RTCStream({
        "client": cc, // 创建的Client对象
        "wsServer": "wss://" + serverAddr
    });
} catch (e) {
    alert("未登录");
}