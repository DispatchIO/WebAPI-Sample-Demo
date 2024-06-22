from util.Signature import Signature

def main():
    username = "qinkw"
    password = "qinkw@123321"
    time = "20240530095112"
    result = Signature(username,password,time).getSignature()
    print(result)
    
if __name__ == '__main__':
    main()