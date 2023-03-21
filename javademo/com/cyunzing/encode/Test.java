package com.cyunzing.encode;

public class Test {
    public static void main(String[] args) {
        Encode encode = new Encode();
        String resultString;
        try {
            resultString = encode.encode("admin", "123456","20210715133607");
        } catch (Exception e) {
            //TODO: handle exception
            e.printStackTrace();
            return;
        }
        System.out.println(resultString);


    }
}
