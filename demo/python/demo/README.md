# python版demo说明

## Signature加密库使用说明

注意，为确保正常运行改库，使用的python应为3.x，还应安装`pycryptodome`

```shell
pip install pycryptodome
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

|   参数   | 示例           | 是否必填                   |
| :------: | -------------- | -------------------------- |
| username | qinkw          | `必填`，值为账号           |
| password | qinkw@123321   | `必填`，值为密码           |
|   time   | 20240530095112 | `非必填`，缺省时为当前时间 |



### 4、代码示例

```python
from util.Signature import Signature

def main():
    username = "qinkw"
    password = "qinkw@123321"
    time = "20240530095112"
    result = Signature(username,password,time).getSignature()
    print(result)
    
if __name__ == '__main__':
    main()
```

输出结果：

```text
cWlua3c6T1Z4bTViTEMxSFpKRWs5T3ZDU2ZKUVBVMFF1UmYzZEwrZW5LYmcrL3l1MD0=
```

