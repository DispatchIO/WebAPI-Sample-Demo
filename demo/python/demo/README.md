# python版demo说明

## Signature加密库使用说明

注意，为确保正常运行，使用的python应为3.x，还应安装`pycryptodome`

```shell
pip install pycryptodome==3.20.0
```



### 1、导入库

````python
from util.Signature import Signature
````



### 2、使用库

```python
username = "qinkw" # 用户名
password = "xxxx" # 密码
result = Signature(username,password).getSignature() # 使用加密库获取加密好的signature
print(result)
```



### 3、库参数解释

|   参数   | 示例           | 是否必填                                                     |
| :------: | -------------- | ------------------------------------------------------------ |
| username | qinkw          | `必填`，值为登录账号                                         |
| password | qinkw@123321   | `必填`，值为登录密码                                         |
|   time   | 20240530095112 | `非必填`，缺省时为当前时间（该值**`建议缺省`**或者按照`%Y%m%d%H%M%S`的格式传入最新时间） |



### 4、代码示例

```python
from util.Signature import Signature

def main():
    username = "qinkw"
    password = "qinkw@123321"
    # time = "20240530095112"
    # result = Signature(username,password,time).getSignature()
    result = Signature(username,password).getSignature()
    print(result)
    
if __name__ == '__main__':
    main()
```

输出结果：

```text
cWlua3c6T1Z4bTViTEMxSFpKRWs5T3ZDU2ZKUVBVMFF1UmYzZEwrZW5LYmcrL3l1MD0=
```



## 登录和保持更新示例说明

注意，为确保正常运行该示例，使用的python应为3.x，还应安装`pycryptodome`和`requests`库

**安装方法1**

```shell
pip install pycryptodome==3.20.0
pip install requests==2.32.2
```

**安装方法2**

```shell
pip install -r requirements.txt
```



### 运行程序

确保运行环境完善后，即可运行demo中的`login.py`

```python
python login.py
```


**控制台输出内容**

```shell
请输入登录的服务器地址(默认120.26.125.181):192.168.1.200    # 输入平台ip地址即可
请输入账号名:qinkw    # 输入操作员账号
请输入密码:qingkw@1223    # 输入操作员密码
账号qinkw的签名为: cWlub1c6T1c4bTNiTEMxSFpKRDs5T3ZDU2ZKWGxJcEpLeDJqZjFIY2swUkdTa3YyQT0=
开始登录...
返回结果为{"msg": "succ", "code": 200, "data": {"map_switch": 1, "user_id": "26a65bcfde435e0abe29c359a999****", "location_switch": 1, "user_rule": "user", "access_token": "7e42010d26ad3e****15148d7aad50fb094f180a", "expires": 3600, "user_name": "qinkw", "api_version": "v2"}}
登录成功
开始保活...
保活中...
{'msg': 'succ', 'code': 200, 'data': {'access_token': '7e42010d26ad3e****15148d7aad50fb094f180a', 'expires': 300, 'user_id': '26a65bcfde435e0abe29c359a999****'}}
......
```



## socketIO事件库使用说明

### 待补充...
