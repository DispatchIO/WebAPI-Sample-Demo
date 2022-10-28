
function stopRtsp(rtspNode) {
    clearInterval(rtspNode.Interval);
    rtspNode.PC.close();
}

function RtspNode(rtspURL, serverURL, remoteVideoElemtId) {
    this.Server = serverURL;
    this.Rtspurl = rtspURL;
    this.SendChannel = null;
    this.config = {
        iceServers: []
    };
    this.PC = new RTCPeerConnection(this.config);
    this.Interval = null;
    this.Offer = null;
    this.RemoteVideo = document.getElementById(remoteVideoElemtId);

    this.PC.onnegotiationneeded = () => {
        this.PC.createOffer().then(offer => {
            this.PC.setLocalDescription(offer);
        })
    };
    this.PC.onicecandidate = iceevent => {
        if (iceevent.candidate == null) {
            getRemoteSdp(rtspNode);
        }
    };

    this.PC.ontrack = rtcTrackEvent => {
        this.RemoteVideo.srcObject = rtcTrackEvent.streams[0];
        this.RemoteVideo.muted = true;
        this.RemoteVideo.autoplay = true;
    };

    rtspPlay(this);
}

function rtspPlay(rtspNode) {
    $.post(rtspNode.Server + "/play", {
    url: btoa(rtspNode.Rtspurl)
  }, function(data) {
      console.log("recv play response: ", data);
      if (data.result !== "succ") {
          console.log(data.reason);
          return;
      }
      console.log('add video Transceiver',);
      rtspNode.PC.addTransceiver('video', {
        'direction': 'sendrecv'
      });

      rtspNode.SendChannel = rtspNode.PC.createDataChannel('foo');
      rtspNode.SendChannel.onclose = function (ev) {
        if(rtspNode.Interval != null) {
          clearInterval(rtspNode.Interval);
          rtspNode.Interval = null;
        }
      };
      rtspNode.SendChannel.onopen = function (ev) {
          console.log('sendChannel has opened');
          rtspNode.SendChannel.send('Keep-Alive');
          rtspNode.Interval = setInterval(function () {
              rtspNode.SendChannel.send('Keep-Alive');
          }, 3000)
      };
      rtspNode.SendChannel.onmessage = function (e) { console.log("Message from DataChannel: payload " + e.data)};
  });
}

function getRemoteSdp(rtspNode) {
    $.post(rtspNode.Server + "/recive", {
        url: btoa(rtspNode.Rtspurl),
        data: btoa(rtspNode.PC.localDescription.sdp)
    }, function(data) {
        console.log("recv recive response: ", data);
        if (data.result != "succ") {
            console.log(data.reason);
            clearInterval(rtspNode.Interval);
            rtspNode.PC.close();
            return;
        }
        try {
            rtspNode.PC.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: atob(data.data)
            }))
        } catch (e) {
          console.log(e);
        }
    });
}
