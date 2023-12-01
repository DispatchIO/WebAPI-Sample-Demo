
let CALL_TYPE = {
    AUDIO : "call-audio",
    VIDEO : "call-audiovideo",
    HALF_AUDIO : "call-halfaudio",
    HALF_VIDEO : "call-halfvideo",
    LIVE: "call-live",
    LOCALVIDEO:"local-video",
};


function Webrtc2Sip(containers, sessionEvent) {
    // 检查是否支持WebRTC
    if (!checkSupportWebrtc()) {
        alert('当前浏览器不支持WebRTC');
        return;
    }
    // 检查是否支持WebSocket
    if (!checkSupportWebsocket()) {
        alert('当前浏览器不支持WebSocket');
        return;
    }
    // if (!containers.videoLocal || !containers.videoRemote || !containers.audioRemote) {
    //     alert("<video>或<audio>参数不全");
    //     return;
    // }

    return new webrtc2sipNode(containers, sessionEvent)
}


class webrtc2sipNode {
    constructor(containers, sessionEvent) {
        this.audioRemote = containers.audioRemote;
        this.videoLocal = containers.videoLocal;
        this.videoRemote = containers.videoRemote;
        this.sessionEvent = sessionEvent;
        this.stackEvent = null;
        this.webrtcStackNode = null;
        this.phone = null;
        this.password = null;
        this.websocketServer = null;
        this.iceservers = null;
        this.callType = null;
        this.login = true;
        this.called = null;
        this.requestTel = null;
    }

    register(options, stackEvent, loglevel) {
        try {
            if (!options.phone || !options.websocketServer) {
                console.log("phone websocketServer 参数不全!");
                return false;
            }

            this.stackEvent = stackEvent;
            this.phone = options.phone;
            this.password = options.password;
            this.protocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
            this.websocketServer = this.protocol + options.websocketServer;

            this.iceservers = options.iceServers
                ? options.iceServers
                    .split(',').map(item => "stun:" + item)
                : [];

            if (this.webrtcStackNode != null){
                this.webrtcStackNode.exit();
            }
            this.webrtcStackNode = new webrtcStack(this.websocketServer, this.phone, this.password,
                (event) => {this.webrtcstackCallback(event)}, this.iceservers);
            return true;
        }
        catch (e) {
            this.webrtcStackNode = null;
            this.stackEventFun({type:"failed_to_start", description:"Stack failed_to_start"});
            return false;
        }
    }

    unRegister() {
        if (this.webrtcStackNode == null) {
            return;
        }

        this.webrtcStackNode.exit();
    }

    sipCall(callType, phoneNumber) {
        var hasVideo = false;
        var hasHalf = false;
        var local = null;
        var remote = null;

        if(this.webrtcStackNode == null) {
            return false;
        }

        if (!phoneNumber) {
            return false;
        }

        if (callType === CALL_TYPE.AUDIO) {
            this.callType = "audio";
            remote = this.audioRemote;
        } else if (callType === CALL_TYPE.HALF_AUDIO) {
            hasHalf = true;
            this.callType = "half/audio";
            remote = this.audioRemote;
        } else if (callType === CALL_TYPE.VIDEO) {
            this.callType = "audio/video";
            hasVideo = true;
            remote = this.videoRemote;
            local = this.videoLocal;
        }else if (callType === CALL_TYPE.HALF_VIDEO) {
            this.callType = "half/video";
            hasVideo = true;
            hasHalf = true;
            remote = this.videoRemote;
            local = this.videoLocal;
        }else if(callType === CALL_TYPE.LIVE){
            this.callType = "half/video";
            hasVideo = true;
            hasHalf = true;
            remote = this.videoRemote;
        }else if(callType === CALL_TYPE.LOCALVIDEO){ // 添加共享屏幕
            this.callType = "half/video";
            hasVideo = true;
            hasHalf = true;
            remote = this.videoRemote;
            local = this.videoLocal;
        } else {
            return false;
        }

        this.sessionEventFun({type:CALL_MESSAGE_TYPE.CONNECTING, description:"Call in progress..."}, "Call");
        this.webrtcStackNode.call(phoneNumber, local, remote, hasVideo, hasHalf);
        return true;
    }

    sipHangUp() {
        if(this.webrtcStackNode == null) {
            return;
        }

        this.webrtcStackNode.hangup();
        return true;
    }

    sipHeart() {
        if(this.webrtcStackNode == null) {
            return;
        }

        this.webrtcStackNode.heart();
        return true;
    }

    sipAnswer() {
        if(this.webrtcStackNode == null) {
            return false;
        }

        if (this.callType === "audio/video" || this.callType === "half/video") {
            this.webrtcStackNode.answer(this.videoLocal, this.videoRemote);
        } else {
            this.webrtcStackNode.answer(null, this.audioRemote);
        }
        this.sessionEventFun({type:"connected", description:"In Call"}, "Call");
        return true;
    }

    sipRequest() {
        if(this.webrtcStackNode == null) {
            return;
        }

        this.webrtcStackNode.pttrequest();

        return true;
    }

    sipRelease() {
        if(this.webrtcStackNode == null) {
            return;
        }

        this.webrtcStackNode.pttrelease();
        return true;
    }

    sipDtmf(dtmfValue) {
        if(this.webrtcStackNode == null) {
            return;
        }

        this.webrtcStackNode.dtmf();
        return true;
    }

    getCallType() {
        return this.callType;
    }

    getCallName() {
        return this.called ? this.called: "未知";
    }

    getRequestName() {
        return this.requestTel ? this.requestTel : "未知";
    }

    sessionEventFun(event, sessionType) {
        if (this.sessionEvent != null) {
            this.sessionEvent(event, sessionType);
        }
    }

    stackEventFun(event) {
        if(this.stackEvent != null){
            this.stackEvent(event);
        }
    }

    webrtcstackCallback(msg) {
        switch (msg.type) {
            case CALL_MESSAGE_TYPE.STARTING:
            case CALL_MESSAGE_TYPE.STARTED:
                this.stackEventFun(msg);
                break;
            case CALL_MESSAGE_TYPE.CONNECTING:
                this.sessionEventFun(msg, "Registration");
                break;
            case CALL_MESSAGE_TYPE.LOGIN:
                if(msg.result) {
                    this.sessionEventFun({type:"connected", description:"Connected"}, "Registration")
                } else {
                    this.sessionEventFun({type:"terminated", description:"Disconnected"}, "Registration")
                }
                break;
            case CALL_MESSAGE_TYPE.MAKECALL:
                this.sessionEventFun({type:"terminated", description:msg.reason},"Call");
                break;
            case CALL_MESSAGE_TYPE.ONRING:
            case CALL_MESSAGE_TYPE.ONRING183:
                this.sessionEventFun({type:"i_ao_request", description:"Ringing"}, "Call");
                break;
            case CALL_MESSAGE_TYPE.ONANSWER:
                this.sessionEventFun({type:"connected", description:"In Call"}, "Call");
                break;
            case CALL_MESSAGE_TYPE.ONHANGUP:
                this.sessionEventFun({type:"terminated", description:msg.reason}, "Call");
                break;
            case CALL_MESSAGE_TYPE.ONNEWCALL:
                this.called = msg.from;
                if (msg.isvideo) {
                    this.callType = "audio/video";
                    if(msg.ishalf) {
                        this.callType = "half/video";
                    }
                } else {
                    this.callType = "audio";
                    if (msg.ishalf) {
                        this.callType = "half/audio";
                    }
                }
                this.stackEventFun({type:"i_new_call", description:"Incoming Call"});
                break;
            case CALL_MESSAGE_TYPE.PTTREQUEST:
                if (msg.result)
                {
                    this.sessionEventFun({type:"requested", description:"requested"}, "Call");
                } else {
                    this.sessionEventFun({type:"failed_to_request", description:"failed_to_request"}, "Call");
                }
                break;
            case CALL_MESSAGE_TYPE.PTTRELEASE:
                this.sessionEventFun({type:"released", description:"released"}, "Call");
                break;
            case CALL_MESSAGE_TYPE.ONPTTREQUEST:
                this.requestTel = msg.tel;
                this.sessionEventFun({type:"on_requested", description: msg.tel}, "Call");
                break;
            case CALL_MESSAGE_TYPE.ONPTTRELEASE:
                this.sessionEventFun({type:"on_released", description:"on_released"}, "Call");
                break;
            case CALL_MESSAGE_TYPE.ONDISCONNECT:
                if (this.login) {
                    this.login = false;
                    this.stackEventFun({type:"stopped", description:"Stack stopped"});
                } else {
                    this.stackEventFun({type:"failed_to_start", description:"Failed to connet to the server"});
                }
                break;
            case CALL_MESSAGE_TYPE.MEETUSERS:
                this.sessionEventFun({type:"meet_users", description:msg.content}, "Call");
                break;

        }
    }
}




let CALL_MESSAGE_TYPE = {
    STARTING :"starting",
    STARTED :"started",
    CONNECTING :"connecting",

    LOGIN : "login",
    MAKECALL : "make_call",
    RING : "ring",
    ANSWER : "answer",
    HANGUP : "hangup",
    LOGOUT : "logout",
    DTMF   : "dtmf",
    PTTREQUEST : "ptt_request",
    PTTRELEASE : "ptt_release",
    HEART : "heart",
    MEETUSERS : "meet_users",

    ONNEWCALL : "on_new_call",
    ONRING : "on_ring",
    ONRING183 : "on_ring_183",
    ONANSWER : "on_answer",
    ONHANGUP: "on_hangup",
    ONPTTREQUEST : "on_ptt_request",
    ONPTTRELEASE : "on_ptt_release",

    ONDISCONNECT: "on_disconnect",
};

let CALL_DIRECTION = {
    IN : 0,
    OUT: 1
};

class webrtcStack {
    constructor(wsurl, tel, passwd, sessionEvent, iceservers) {
        if (!wsurl.endsWith("/")) {
            wsurl = wsurl + "/";
        }
        this.wsurl = wsurl + "webrtcMedia";
        this.tel = tel;
        this.passwd = passwd;
        this.WSStatus = false;
        this.onMessage = sessionEvent;
        this.notify({type:"starting", description:"Stack starting"});
        this.WS = new WebSocket(this.wsurl);
        this.interval = null;
        if (iceservers.length > 0) {
            this.config = {
                iceServers: [{urls:iceservers}]
            };
        } else {
            this.config = {
                iceServers: []
            };
        }

        this.WS.onopen = () => {
            console.log("ws connect succ.");
            this.notify({type:"started", description:"Stack started"});
            this.WSStatus = true;
            this.notify({type:"connecting", description:"connecting"});
            this.login();
        };
        this.WS.onclose = ev => {
            console.log("ws connect close.", ev);
            this.WSStatus = false;
            this.regStatus = false;
            this.callStatus = false;
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = null;
            }
            this.notify({"type":CALL_MESSAGE_TYPE.ONDISCONNECT});
        };

        this.WS.onmessage = ev => {
            var recvmsg = JSON.parse(ev.data);
            console.log(recvmsg);
            switch (recvmsg.type) {
                case CALL_MESSAGE_TYPE.LOGIN:
                    if(recvmsg.result && !this.regStatus){
                        this.regStatus = true;
                    }

                    if (!recvmsg.result){
                        this.WS.close();
                    }
                    this.notify({"type":recvmsg.type, "result":recvmsg.result, "reason":recvmsg.reason===undefined?"":recvmsg.reason});
                    if (this.interval) {
                        clearInterval(this.interval);
                        this.interval = null;
                    }
                    this.interval = setInterval(() => this.heart(), 30000);
                    break;
                // case CALL_MESSAGE_TYPE.LOGOUT:
                //     // this.regStatus = false;
                //     // this.notify({"type":recvmsg.type, "result":recvmsg.result, "reason":recvmsg.reason===undefined?"":recvmsg.reason});
                //     break;
                case CALL_MESSAGE_TYPE.PTTREQUEST:
                case CALL_MESSAGE_TYPE.PTTRELEASE:
                    this.notify({"type":recvmsg.type, "result":recvmsg.result});
                    break;
                case CALL_MESSAGE_TYPE.ONPTTREQUEST:
                    this.notify({"type":recvmsg.type, "tel":recvmsg.content===undefined?"":recvmsg.content});
                    break;
                case CALL_MESSAGE_TYPE.ONPTTRELEASE:
                    this.notify({"type":recvmsg.type});
                    break;
                case CALL_MESSAGE_TYPE.ONRING:
                    this.ringbacktone.currentTime = 0;
                    this.ringbacktone.play();
                    this.notify({"type":recvmsg.type});
                    break;
                case CALL_MESSAGE_TYPE.ONRING183:
                    this.ringbacktone.pause();
                    this.onanswer(recvmsg.sdp);
                    this.notify({"type":recvmsg.type});
                    break;
                case CALL_MESSAGE_TYPE.ONANSWER:
                    this.ringbacktone.pause();
                    this.onanswer(recvmsg.sdp);
                    this.notify({"type":recvmsg.type});
                    break;
                case CALL_MESSAGE_TYPE.ONHANGUP:
                    this.notify({"type":recvmsg.type, "reason":recvmsg.reason===undefined?"":recvmsg.reason});
                    this.closeCall();
                    this.ringtone.pause();
                    this.ringbacktone.pause();
                    break;
                case CALL_MESSAGE_TYPE.MEETUSERS:
                    this.notify({"type":recvmsg.type, "content":recvmsg.content});
                    break;
                case CALL_MESSAGE_TYPE.ONNEWCALL:
                    if (!checkSupportWebrtc()) {
                        this.hangupWithReason("浏览器不支持WEBRTC");
                        break;
                    }
                    this.setRemoteSdp = false;
                    this.isHalf = recvmsg.ishalf;
                    this.isVideo = recvmsg.isvideo;
                    this.remoteSdp = recvmsg.sdp;
                    this.callDirection = CALL_DIRECTION.IN;
                    this.ring();
                    this.callStatus = true;
                    this.ringtone.currentTime = 0;
                    this.ringtone.play();
                    this.notify(recvmsg);
                    break;
            }
        };

        this.WS.onerror = ev => {
            console.log(ev);
        };

        this.regStatus = false;

        this.PC = null;
        this.callStatus = false;
        this.isVideo = false;
        this.localStream = null;
        this.localElement = null;
        this.remoteElement = null;
        this.isHalf = false;
        this.callDirection = CALL_DIRECTION.OUT;
        this.remoteSdp = null;
        this.setRemoteSdp = false;

        this.ringbacktone = new Audio("sounds/ringbacktone.wav");
        this.ringbacktone.loop = true;
        this.ringtone = new Audio("sounds/ringtone.wav");
        this.ringtone.loop = true;
    }

    notify(content) {
        if (this.onMessage != null) {
            this.onMessage(content);
        }
    }

    onanswer(sdp) {
        if (!this.setRemoteSdp) {
            this.PC.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: sdp
            }));
            this.setRemoteSdp = true;
        }
    }

    onnewcall(sdp) {
        if(!this.setRemoteSdp) {
            this.PC.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: sdp
            }));
            this.setRemoteSdp = true
        }
    }

    heart() {
        if (this.regStatus) {
            this.sendTo({"type":CALL_MESSAGE_TYPE.HEART, "user_name":this.tel});
        }
    }

    login() {
        if (isWindows()) {
            this.sendTo({"type":CALL_MESSAGE_TYPE.LOGIN, "user_name":this.tel, "pass_word":this.passwd, "user_agent":"windows"})
        } else {
            this.sendTo({"type":CALL_MESSAGE_TYPE.LOGIN, "user_name":this.tel, "pass_word":this.passwd, "user_agent":"other"})
        }

    }

    logout() {
        this.regStatus = false;
        this.sendTo({"type":CALL_MESSAGE_TYPE.LOGOUT, "user_name":this.tel});
    }

    dtmf(value) {
        if (!this.callStatus) {
            return false;
        }
        var dtmfAudio = new Audio("sounds/dtmf.wav");
        dtmfAudio.play();
        this.sendTo({"type":CALL_MESSAGE_TYPE.DTMF, "content":value});
        return true;
    }

    pttrequest() {
        if (!this.callStatus) {
            return false;
        }
        this.sendTo({"type":CALL_MESSAGE_TYPE.PTTREQUEST});
        return true;
    }

    pttrelease() {
        if (!this.callStatus) {
            return false;
        }
        this.sendTo({"type":CALL_MESSAGE_TYPE.PTTRELEASE});
        return true;
    }

    exit() {
        this.ringtone.pause();
        this.ringbacktone.pause();
        if(this.regStatus) {
            this.logout();
        }
        this.regStatus = false;
        this.callStatus = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.WS.close();
    }

    call(called, localElement, remoteElement, isVideo, isHalf) {
        try{
            if(!this.regStatus) {
                console.log("user is not login");
                this.notify({"type":CALL_MESSAGE_TYPE.MAKECALL, "result": false, "reason":"用户未登录"});
                return;
            }

            if(this.callStatus) {
                console.log("has in calling");
                this.notify({"type":CALL_MESSAGE_TYPE.MAKECALL, "result": false, "reason":"已经在呼叫中"});
                return;
            }

            if(!checkSupportWebrtc()) {
                this.notify({"type":CALL_MESSAGE_TYPE.MAKECALL, "result": false, "reason":"浏览器不支持WEBRTC"});
                return;
            }

            this.localElement = localElement;
            this.remoteElement = remoteElement;
            this.isVideo = isVideo;
            this.isHalf = isHalf;
            this.callStatus = true;
            this.callDirection = CALL_DIRECTION.OUT;
            this.setRemoteSdp = false;

            this.PC = new RTCPeerConnection(this.config);
            this.PC.onnegotiationneeded = () => {
                this.PC.createOffer().then(offer => {
                    this.PC.setLocalDescription(offer);
                })
            };

            this.PC.onicecandidate = iceevent => {
                if(iceevent.candidate == null){
                    this.sendTo({
                        "type": CALL_MESSAGE_TYPE.MAKECALL,
                        "from": this.tel,
                        "to": called,
                        "sdp": this.PC.localDescription.sdp,
                        "ishalf": this.isHalf,
                        "isvideo": this.isVideo
                    })
                }
            };

            this.PC.ontrack = rtcTrackEvent => {
                this.remoteElement.srcObject = rtcTrackEvent.streams[0];
                this.remoteElement.autoplay = true;
            };

            if(isVideo && isHalf && localElement == null) {
                this.addTransceivers();
            } else {
                this.gotLocalMedia();
            }
        }catch (e) {
            this.callStatus = false;
            this.notify({"type":CALL_MESSAGE_TYPE.MAKECALL, "result": false, "reason": "" + e});
        }
        
    }

    answer(localElement, remoteElement) {
        this.localElement = localElement;
        this.remoteElement = remoteElement;
        this.PC = new RTCPeerConnection(this.config);

        this.PC.onnegotiationneeded = () => {
            this.onnewcall(this.remoteSdp);
            this.PC.createAnswer().then(answer => {
                this.PC.setLocalDescription(answer);
            })
        };

        this.PC.onicecandidate = iceevent => {
            if(iceevent.candidate == null){
                this.sendTo({
                    "type": CALL_MESSAGE_TYPE.ANSWER,
                    "from": this.tel,
                    "sdp": this.PC.localDescription.sdp,
                })
            }
        };

        this.PC.ontrack = rtcTrackEvent => {
            this.remoteElement.srcObject = rtcTrackEvent.streams[0];
            this.remoteElement.autoplay = true;
        };

        this.ringtone.pause();

        this.gotLocalMedia();
    }

    hangup() {
        this.sendTo({
            "type": CALL_MESSAGE_TYPE.HANGUP,
            "from": this.tel
        });
        this.closeCall();
        this.ringtone.pause();
        this.ringbacktone.pause();
    }

    hangupWithReason(reason) {
        this.sendTo({
            "type": CALL_MESSAGE_TYPE.HANGUP,
            "from": this.tel,
            "reason":reason
        });
        this.closeCall();
    }

    ring() {
        this.sendTo({
            "type": CALL_MESSAGE_TYPE.RING,
            "from": this.tel
        });
    }

    sendTo(msg) {
        if(this.WSStatus)
        {
            console.log("send msg to server >>>>>>>>>>", msg);
            this.WS.send(JSON.stringify(msg));
        } else {
            console.log("wsstatus error, wsstatus: ", this.WSStatus)
        }
    }

    // gotLocalMedia() {
    //     if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    //         navigator.getUserMedia = navigator.mediaDevices.getUserMedia;
    //     } else {
    //         navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    //     }
    //
    //     if(navigator.getUserMedia){
    //         var config = {};
    //         if (this.isVideo) {
    //             config = {
    //                 // audio: {echoCancellation:true,noiseSuppression:true,autoGainControl:true},
    //                 audio: {echoCancellation:true,noiseSuppression:true},
    //                 // audio: true,
    //                 video: {advanced:[{height:720, width:1280}]}
    //
    //
    //
    //             }
    //         } else {
    //             config = {
    //                 // audio: {echoCancellation:true,noiseSuppression:true,autoGainControl:true},
    //                 audio: {echoCancellation:true,noiseSuppression:true},
    //                 // audio: true,
    //                 video: false
    //             }
    //         }
    //
    //         navigator.getUserMedia(config).then(stream => {
    //             this.localStream = stream;
    //             if(this.isVideo && this.localElement != null){
    //                 this.localElement.srcObject = stream;
    //                 this.localElement.muted = true;
    //             }
    //
    //             stream.getTracks().forEach( track => {
    //                 this.PC.addTrack(track, stream)
    //             });
    //
    //         }).catch( error => {
    //             console.log(error);
    //             if (this.callDirection === CALL_DIRECTION.OUT)
    //             {
    //                 this.notify({"type":CALL_MESSAGE_TYPE.MAKECALL, "result":false, "reason": "getUserMedia fail."});
    //                 this.closeCall();
    //             } else {
    //                 this.notify({"type":CALL_MESSAGE_TYPE.ANSWER, "result":false, "reason": "getUserMedia fail."});
    //                 this.hangupWithReason("getUserMedia function");
    //                 this.closeCall();
    //             }
    //         })
    //     } else {
    //         if (this.callDirection === CALL_DIRECTION.OUT) {
    //             this.notify({"type":CALL_MESSAGE_TYPE.MAKECALL, "result":false, "reason": "can't get getUserMedia function."});
    //             this.closeCall();
    //         } else {
    //             this.notify({"type":CALL_MESSAGE_TYPE.ANSWER, "result":false, "reason": "can't get getUserMedia function."});
    //             this.hangupWithReason("can't get getUserMedia function");
    //             this.closeCall();
    //         }
    //     }
    // }

    addTransceivers() {
        this.PC.addTransceiver('audio', {
            'direction': 'sendrecv'
        });

        this.PC.addTransceiver('video', {
            'direction': 'sendrecv'
        });
    }

    gotLocalMedia() {
        var config = {};
        if (this.isVideo) {
            config = {
                audio: {echoCancellation: true, noiseSuppression: true},
                video: {advanced: [{height: 720, width: 1280}]}
            }
        } else {
            config = {
                audio: {echoCancellation: true, noiseSuppression: true},
                video: false
            }
        }

        if(navigator.getUserMedia) {
            console.log("getUserMedia");
            navigator.mediaDevices.getDisplayMedia({
                audio: true,
                video: true
            }).then(stream => {
                this.getMediaSucc(stream);
                // document.getElementById('#video_local').srcObject = stream;
            }).catch(error => {
                console.log("error:"+error);
                this.getMediaFail(error);
            });

            // navigator.getUserMedia(config, stream =>{
            //     this.getMediaSucc(stream);
            // }, error=>{
            //     this.getMediaFail(error);
            // });
        } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            console.log("mediaDevices");
            navigator.mediaDevices.getUserMedia(config).then(stream => {
                this.getMediaSucc(stream);
            }).catch(error => {
                this.getMediaFail(error);
            })
        } else if (navigator.webkitGetUserMedia) {
            console.log("webkitGetUserMedia");
            navigator.webkitGetUserMedia(config, stream =>{
                this.getMediaSucc(stream);
            }, error=>{
                this.getMediaFail(error);
            });
        }else if (navigator.mozGetUserMedia){
            console.log("mozGetUserMedia");
            navigator.mozGetUserMedia(config, stream =>{
                this.getMediaSucc(stream);
            }, error=>{
                this.getMediaFail(error);
            });
        } else {
            if (this.callDirection === CALL_DIRECTION.OUT) {
                this.notify({"type":CALL_MESSAGE_TYPE.MAKECALL, "result":false, "reason": "浏览器不支持WEBRTC"});
                this.closeCall();
            } else {
                this.notify({"type":CALL_MESSAGE_TYPE.ANSWER, "result":false, "reason": "浏览器不支持WEBRTC"});
                this.hangupWithReason("can't get getUserMedia function");
                this.closeCall();
            }
        }
    }

    getMediaSucc(stream) {
        this.localStream = stream;
        if (this.isVideo && this.localElement != null) {
            this.localElement.srcObject = stream;
            this.localElement.muted = true;
        }

        stream.getTracks().forEach(track => {
            this.PC.addTrack(track, stream)
        });
    }

    getMediaFail(error) {
        console.log(error);
        if (this.callDirection === CALL_DIRECTION.OUT) {
            this.notify({"type": CALL_MESSAGE_TYPE.MAKECALL, "result": false, "reason": "获取媒体资源失败"});
            this.closeCall();
        } else {
            this.notify({"type": CALL_MESSAGE_TYPE.ANSWER, "result": false, "reason": "获取媒体资源失败"});
            this.hangupWithReason("getUserMedia function");
            this.closeCall();
        }
    }

    closeCall(){
        if (this.PC != null){
            this.PC.close();
            this.PC = null;
            this.localElement = null;
            this.remoteElement = null;
            this.isVideo = false;
        }

        if(this.localStream != null) {
            this.localStream.getTracks().forEach(track => {
                this.localStream.removeTrack(track);
                track.stop();
            });
            this.localStream = null;
        }

        this.callStatus = false;
    }
}

function checkSupportWebrtc() {
    //check if the browser supports the WebRTC
    try {
        return !!((navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || navigator.getUserMedia || navigator.webkitGetUserMedia ||
            navigator.mozGetUserMedia);
    } catch (e) {
        return false;
    }

}

function checkSupportWebsocket() {
    try {
        return !!window.WebSocket;
    }
    catch (e) {
        return false;
    }
}

function isWindows() {
    var useragnet = navigator.platform;
    return (useragnet.indexOf("Win") >= 0);
}