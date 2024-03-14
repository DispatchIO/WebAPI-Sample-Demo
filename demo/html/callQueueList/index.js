$(document).ready(function () {
  // 设置token
  let token = localStorage.getItem("DispRTC-token");
  const cc = DispRTC.createClient({
    server: "https://192.168.1.200",
    token: token,
  });

  const rtcStream = new DispRTC.RTCStream({
    client: cc,
    phone: "801",
    password: "1",
    wsServer: "ws://192.168.1.200",
  });
  rtcStream.init(
    function (event) {
      console.log("sessionEvent:" + event);
    },
    function (event) {
      console.log("stackEvent:" + event);
    }
  );

  cc.client.callSessions
    .getCallQueueStatusList({ beginIndex: 0, count: 20 })
    .then((res) => {})
    .catch((err) => {});
});
