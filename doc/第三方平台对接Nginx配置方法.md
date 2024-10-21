# 第三方平台对接Nginx配置方法

## 简介

WebRTC（Web Real-Time Communication）是一种支持网页浏览器进行实时语音对话或视频聊天的技术。

由于WebRTC技术在实现实时通信时涉及敏感的用户数据和媒体流，为了确保这些数据的安全传输，避免潜在的安全威胁，如中间人攻击和数据泄露等，WebRTC规范要求所有使用WebRTC的应用都必须在HTTPS环境下运行。

HTTPS通过SSL/TLS加密，为数据传输提供了安全的通道，保证了用户信息在互联网上的传输过程中不被窃听或篡改。

**因此，开发和部署时，必须确保服务器支持并强制使用HTTPS协议。**



## nginx.conf server的配置

### 1、配置服务器地址和端口

```nginx
# 配置服务器ip地址
set $dispatch_server_ip 'https://120.xx.xxx.xx:443'; // 配置为应急指挥调度平台所在的ip地址和端口
```



### 2、允许头部使用下划线

```nginx
# 允许头部使用下划线的
underscores_in_headers on;
```



## nginx.conf location的配置

### 请求接口的代理配置

```nginx
# 请求接口代理
location /api/v2 {
    proxy_ssl_verify   off;
    proxy_redirect     off;
    proxy_set_header   Host             $host;
    proxy_set_header   X-Real-IP        $remote_addr;
    proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
    proxy_pass $dispatch_server_ip;
}
```



### 事件上报的代理配置

```nginx
# 事件上报代理
location /socket.io {
    proxy_ssl_verify   off;
    proxy_set_header   Upgrade          $http_upgrade;
    proxy_set_header   Connection       "upgrade";
    proxy_http_version 1.1;
    proxy_pass $dispatch_server_ip;
}
```



### WebRTC的代理配置

```nginx
# webrtc代理
location /webrtcMedia {
    proxy_ssl_verify   off;
    proxy_set_header   Upgrade          $http_upgrade;
    proxy_set_header   Connection       "upgrade";
    proxy_http_version 1.1;
    proxy_pass $dispatch_server_ip;
}
```



### 视频播放的代理配置

```nginx
# 视频播放代理
location /rtspplay {
    proxy_ssl_verify   off;
    proxy_set_header   Upgrade          $http_upgrade;
    proxy_set_header   Connection       "upgrade";
    proxy_http_version 1.1;
    proxy_pass $dispatch_server_ip;
}
```



### SSE的代理配置【可选】

```nginx
# SSE代理
location /stream {
    proxy_ssl_verify   off;
    proxy_set_header   Host              $host;
    proxy_set_header   Upgrade           $http_upgrade;
    proxy_set_header   Connection        "upgrade";
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_cache                          off;
    proxy_buffering                      off;
    proxy_http_version                   1.1;
    chunked_transfer_encoding            off;
    proxy_pass $dispatch_server_ip;
}
```





## nginx.conf配置demo

```nginx
# 应急指挥调度系统Nginx代理配置
server {
    listen       2443 ssl; # 监听的端口
    server_name  localhost;

    ssl_certificate            192.168.1.200.pem; # 自签证书
    ssl_certificate_key        192.168.1.200.key; # 自签证书

    ssl_session_cache          shared:SSL:1m;
    ssl_session_timeout        5m;
    ssl_ciphers                HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers  on;

    # 允许头部使用下划线的
    underscores_in_headers on; 

    # 配置服务器ip地址和端口
    set $dispatch_server_ip 'https://120.xx.xxx.xxx:443';

    # 页面demo
    location /demo {
        alias   html;
        index  index.html index.htm;
    }

    # 请求接口代理
    location /api/v2 {
        proxy_ssl_verify   off;
        proxy_redirect     off;
        proxy_set_header   Host             $host;
        proxy_set_header   X-Real-IP        $remote_addr;
        proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
        proxy_pass $dispatch_server_ip;
    }

    # 事件上报代理
    location /socket.io {
        proxy_ssl_verify   off;
        proxy_set_header   Upgrade          $http_upgrade;
        proxy_set_header   Connection       "upgrade";
        proxy_http_version 1.1;
        proxy_pass $dispatch_server_ip;
    }

    # webrtc代理
    location /webrtcMedia {
        proxy_ssl_verify   off;
        proxy_set_header   Upgrade          $http_upgrade;
        proxy_set_header   Connection       "upgrade";
        proxy_http_version 1.1;
        proxy_pass $dispatch_server_ip;
    }

    # 视频播放代理
    location /rtspplay {
        proxy_ssl_verify   off;
        proxy_set_header   Upgrade          $http_upgrade;
        proxy_set_header   Connection       "upgrade";
        proxy_http_version 1.1;
        proxy_pass $dispatch_server_ip;
    }

    # SSE代理
    location /stream {
        proxy_ssl_verify   off;
        proxy_set_header   Host              $host;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache                          off;
        proxy_buffering                      off;
        proxy_http_version                   1.1;
        chunked_transfer_encoding            off;
        proxy_pass $dispatch_server_ip;
    }

}
```

