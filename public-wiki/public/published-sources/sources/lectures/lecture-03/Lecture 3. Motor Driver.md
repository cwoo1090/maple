---
title: "Lecture 3. Motor Driver"
source: "https://yechxn.notion.site/Lecture-3-Motor-Driver-32ee1d48d52680bbba4ad64277c02e4e"
author:
published:
created: 2026-04-24
description: "A collaborative AI workspace, built on your company context. Build and orchestrate agents right alongside your team's projects, meetings, and connected apps."
tags:
  - "clippings"
---
## Lecture 3. Motor Driver

<video controls="" src="https://file.notion.so/f/f/f56f5713-7135-43de-ae01-354c44b36015/dee25b29-cc8a-41f5-8a15-8ab2abe88313/video2337877947.mp4?table=block&amp;id=32ee1d48-d526-80f6-9641-c174bdd83598&amp;spaceId=f56f5713-7135-43de-ae01-354c44b36015&amp;expirationTimestamp=1777068000000&amp;signature=HuA-YWdeMsq1T8lt46MNAt_Rtr9JbtptxgFJEK22pYc"></video>

<audio controls="" src="https://file.notion.so/f/f/f56f5713-7135-43de-ae01-354c44b36015/8a2c41ad-dd93-4638-aafc-7d767bc6a2dc/audio2337877947.m4a?table=block&amp;id=32ee1d48-d526-80d8-8cab-f3cd45786058&amp;spaceId=f56f5713-7135-43de-ae01-354c44b36015&amp;expirationTimestamp=1777068000000&amp;signature=K5vt7xXhP-iBZMgdsXyG8LNWUbU6kHKdx3tvMjEwwpM"></audio>

![](https://yechxn.notion.site/image/attachment%3Ae7bef7de-ae6a-4768-91d2-7724a5166799%3AF2E07465-4ECE-4194-8130-F1B9288898A9.png?table=block&id=32ee1d48-d526-803d-919f-c9e47fd9a05b&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

주민찬 선생님 ⇒ motor driver 관련 강의를 해주실 것

펌웨어를 주민찬 선생님께서 짜심 (박수)

![](https://yechxn.notion.site/image/attachment%3Abce6aa86-1ef9-439d-8f52-e3f616b4247f%3A51F9B2CA-6987-41BB-B72A-ABE1EF53BCED.png?table=block&id=32ee1d48-d526-80a5-8306-fed96dbb533f&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A3425aed6-8ab0-4d6f-869a-be5bd7fc1910%3AA859BC9B-0694-4D2F-ADD2-5E8DE9390F2E.png?table=block&id=32ee1d48-d526-80b6-8fb1-e6a16dea3e17&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

토크상수인데 토크센서 없이 어떻게 잴까?

토크 ~ 역기전력: 정확히 비례

역기전력 상수를 재면 됨

각속도→ EMF 이 비율이 EMF 상수

a상, b상 사이에 오실로 물리고→ 각속도 빠르게 할 수록 진폭이 커짐 (그 sine 파 자체가 전기신호의 각속도)

![](https://yechxn.notion.site/image/attachment%3A146252d2-6ad7-4fa9-9d09-a9416ba1ebf1%3AB49DB4BC-E8EA-462F-97D3-ADE82F9CC93D.png?table=block&id=32ee1d48-d526-801e-a066-d27817ca4576&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1290&userId=&cache=v2)

이 식 굉장히 중요

토크센서 없이 토크상수 구하기

디버깅

등등… 많이 쓰임

q축 전압 (v\_q)= 실존 물리량이 아님. 정의하기 나름

a상 전압 (v\_a)→ 찍어보면, v\_q를 진폭으로 갖는 sine파가 나온다는 결론

b상 전압 (v\_b)

![](https://yechxn.notion.site/image/attachment%3A13d606e3-8db1-4086-9db9-904ad7c662ae%3A3708B6F0-B2F3-4126-8B88-ABDB14F744EA.png?table=block&id=32ee1d48-d526-80ef-8024-d9dd460c195e&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3Ab11131f9-f012-4273-9516-4f5b3dacdf2b%3A054A923F-F5E6-442E-BCA2-4A212C6F9BC1.png?table=block&id=32ee1d48-d526-809f-9e4c-ef31d575d5bc&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) Thevenin 정리 = 구분할 수 없다는 결론 ⇒

구분할 필요도 없다

는 것.

delta / wye / … ⇒ 뭔지 다 상관없고, 어차피 등가임.

serial Y winding으로 가정하고 전개해도 1도 문제 없다.

![](https://yechxn.notion.site/image/attachment%3A857f760f-4d46-4b88-a0c4-68284ddab391%3A07855E6B-4973-439A-902A-E90F197B9291.png?table=block&id=32ee1d48-d526-807b-99c0-fb248fac7e10&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

a, b, c 상의 위상이 120도 차이나게 배치되었으므로 2/3 \* pi 차이인 것은 맞음

But, 삼각함수일 필요 없음

PMSM에 한정된 quiz임 ⇒ 삼각함수일 필요가 없는데, 제조사가 삼각함수로 만듦

BLDC는 애초에 trapezoidal 하다→ 삼각함수 아님

![](https://yechxn.notion.site/image/attachment%3A4c58bbc3-e918-41c9-b534-cce622b7add4%3AF30B4E88-217D-4EF1-8391-1DBFD8CF34CD.png?table=block&id=32ee1d48-d526-802e-ba2c-f81eb65eac8e&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

여러 이빨 물리는 것 = distributed winding

권선 배치를 적절하게 해서… 여러 사각파를 조금씩 밀어서 배치해서 삼각함수처럼 보이게 만듦

사각파 비스무리한 것들이 더해져서 sine 함수 비스무리한 것을 만드는 것

flux 가 새는 것을 적당히 이용해서, 사각파를 잘 깎아서 sine파처럼 만든다.

sine파일 이유는 없는데, 그냥 그렇게 보이게 만드는 것 ~ ~

![](https://yechxn.notion.site/image/attachment%3Abcf1ad59-29ca-4aec-b1c3-b0e8f0934a17%3ABD9A8062-3914-45FC-998D-46C8531652F5.png?table=block&id=32ee1d48-d526-8024-aaab-e7d641bd5049&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

나중에 winding function 개념에서 나온다!

그 때 엄밀한 증명으로 퀴즈 내실 것

![](https://yechxn.notion.site/image/attachment%3A767f4205-3772-4046-b8cc-c955bd35829f%3A6F18CFC7-04AF-4921-A080-8BD00A6E15A3.png?table=block&id=32ee1d48-d526-8034-a08c-e3209cff0155&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

상수 아님

![](https://yechxn.notion.site/image/attachment%3A84a7bea4-2bce-4c54-b9a6-5aab12eb41b6%3AE247794E-9E7B-4F8D-9376-449251C4B5D0.png?table=block&id=32ee1d48-d526-806b-b558-f3ebe8b06c2a&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A2f01a445-0b1b-407e-a167-800585042b96%3A37AFB314-11F4-4F77-9DD1-BBD6E17A91B1.png?table=block&id=32ee1d48-d526-8064-86b5-e0eced9a0968&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

d-q axis: dq ↔ abc 만 오갈 수 있으면 됨 x = Park(Clark(x))

d, q는 물리학적인 의미가 있는 것이 아니다.

a, b, c에서 키르히호프 1자유도 뺀 것

나중에 모터 드라이버, 전류제어, FEM, … ⇒ 실수는 이러한

convention이 맞지 않아서

주로 생김!! ![](https://yechxn.notion.site/image/attachment%3Af1c2e5d9-1705-4cd9-96d8-e815eadda751%3AE49DD9C1-FCD8-4064-8EDE-F2CF947DC99D.png?table=block&id=32ee1d48-d526-8088-8b23-dddff98a8d0f&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

우측 식 = 근사 식: 매우 중요한 식

![](https://yechxn.notion.site/image/attachment%3A68752b67-bbf3-40c9-83e8-3fa2870e52e1%3ABBCA7BC8-B9F9-47BF-818B-1ED8FE631A96.png?table=block&id=32ee1d48-d526-806e-8bf7-ec89c274f741&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

근사가 통하는 식인지를 항상 염두에 두고 있어야 한다!!

Q1. inductance Ls→ d, q 축 flux에 대해 다를 수 있음

Q2. 언제부터 근사가 들어간걸까

![](https://yechxn.notion.site/image/attachment%3A8a54b052-0e1b-4b8a-b3c3-1b846bb1d5b0%3A25C8229B-42DC-4653-B504-ABADB61E2A24.png?table=block&id=32ee1d48-d526-8012-8aef-c6922b42e469&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1330&userId=&cache=v2)

(theta\_e) 를 염두에 두면, 달라지게 된다.

![](https://yechxn.notion.site/image/attachment%3A6d6565eb-0af2-41bf-8073-c2a75d007f7c%3A9F9C39CF-1AE3-4964-BC76-7940DA013593.png?table=block&id=32ee1d48-d526-8091-ab6b-d938e38851e3&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3Aa8d0921c-8bc0-440a-b8fa-b7f0ae372046%3A587365D2-8AB5-4057-A28C-4EF7C5FD2A73.png?table=block&id=32ee1d48-d526-80b6-ac77-e07f8e027bb2&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

lambda = flux linkage - current 간 관계가 상수일 이유가 없다

flux leakage = B field 의 적분이다. (H field 아님)

current i = H field이다→ 선형일 필요 없는 것

전류가 커지면 맞지 않는 식이 된다.

어디가 근사식인지 알아야 한다!!

![](https://yechxn.notion.site/image/attachment%3A37408cbd-c393-43e0-922d-a8d0ab78ee05%3A12D1FCDF-E346-4460-BAAA-151EB78E5C2F.png?table=block&id=32ee1d48-d526-803b-9967-d17e1bac473c&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

모터 드라이버 - 전류 제어

![](https://yechxn.notion.site/image/attachment%3A4234e003-b05d-426c-9466-c1a835e78ec7%3A1E60E862-9C8F-4D00-A01B-3031557663D7.png?table=block&id=32ee1d48-d526-806f-a412-e46b2bb5945d&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A0d4726ef-1def-4a65-9554-d9afea387091%3A2A6FC50C-4399-4173-97D1-3775C104EE0D.png?table=block&id=32ee1d48-d526-807c-ae21-d628567d47a3&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A7902325f-f0d7-4928-b8af-0e696f50896d%3A5FE6CB0A-C4EF-4635-8823-9A7706645BD9.png?table=block&id=32ee1d48-d526-80c4-9613-d81b3d90311a&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A31453c48-cf29-4283-b172-4cee6f2d1cec%3ACFFB6C98-C4F4-4213-A8D8-5AB09A8DE008.png?table=block&id=32ee1d48-d526-8037-9dab-ffa28eee1e7c&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A1489f521-492f-4b2b-8e4d-05ad9be9c369%3A49CB3003-9289-4FB6-98FF-ACB4433F78CA.png?table=block&id=32ee1d48-d526-804a-8fa9-df5f01a4305a&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

모터에 들어갈 전압을 어떻게 만들까? = inverter

![](https://yechxn.notion.site/image/attachment%3Aed7065a5-14c9-4a95-a15c-dce4b8c0c90d%3AE230A5A0-C1A9-4E0A-8EF6-732E21F9113D.png?table=block&id=32ee1d48-d526-8045-b84e-ec924d574a9b&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

모터 자체는 거대한 inducter→ voltage를 pulse로 넣어도, 부드럽게 적분해서 모터가 들어가는 것

DC supply→ inverter→ 3상 전압(a, b, c) 으로 바꿔줌

![](https://yechxn.notion.site/image/attachment%3Aa10ef18c-1999-4f7c-86d8-679fffc45889%3AF57BAE81-49CC-446B-9BBE-B399D0BFBE73.png?table=block&id=32ee1d48-d526-8056-b6bd-e34a404c31fb&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

high side (HS)

low side (LS)

⇒ 두 state를 왔다리 갔다리 하면서 pulse 파를 쏘는 것

3-phase inverter = 6개의 switch

SV (space vector) 라고 부름 = 3차원 벡터 - ex. (0, 0, 1)

![](https://yechxn.notion.site/image/attachment%3A87755ed5-1307-4b74-98b7-b7fe0cdc63fe%3AFC763F5A-6187-4C90-8369-627292B556E4.png?table=block&id=32ee1d48-d526-8081-9b6e-de21795bd6c1&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A7bab3995-dfc3-4132-b8a5-7569c59ee655%3A5435F9C6-12DE-4C7B-BDB1-7E46D7B04BC5.png?table=block&id=32ee1d48-d526-8061-8b2e-e2b263d09f89&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

capacitor에 전하를 잠깐 쌓아서 MOSFET을 잠깐 열어주는 것

부트스트랩: 충전을 못해서 요즘에 안 쓴다

Charge Pump: 부트스트랩처럼 생긴 것이 capacitor에 전하를 밀어넣어준다

![](https://yechxn.notion.site/image/attachment%3A375ea9d1-1ad3-4af6-84d8-a717a37f80ea%3AFEEE02C4-F1C1-4C2D-AE77-ECF9A48D60E6.png?table=block&id=32ee1d48-d526-803a-b546-f61f7aaa57ce&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A9b621f27-1eae-4dfc-b0fc-451ffd3581ca%3A26C6D2E2-6815-4819-B90B-830BB261876C.png?table=block&id=32ee1d48-d526-8027-8101-c8a63989de34&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

V0, V7을 적절히 섞는 것

0, 7번: 아무 일도 안한다→ 남는 시간에 넣고 / V1, V2를 적절히 넣어주면 일을 한다

torque ripple

전압을 인가한 시점에만 전류 증가, 끄면 전류 감소

4개의 vector를 섞어서 전류 ripple / torque ripple 을 줄여준다 = 변조를 해준다!

state vector = 시간에 따른 state로 변조를 해준다

V0, V7: 아무 일도 안하는 벡터 2개

![](https://yechxn.notion.site/image/attachment%3Afd2c1d56-1fc7-427c-99b4-15c94009fef3%3A09B543E4-A0FA-4C2C-B8C6-84A3FE1F79A0.png?table=block&id=32ee1d48-d526-8074-a7fe-e97285c650a5&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

육각형 내접원 = 유지할 수 있는 최대치의 voltage = maximum modulation phase voltage

과변조 방식은 거의 안 씀 (모터가 덜덜 떨림)

1~5% 정도는 남겨둬야 함. 적당히 조금 남겨라~

MOR (Motor Operating Region): motor가 사용 가능한 region이 줄어든다.

![](https://yechxn.notion.site/image/attachment%3Aee5fc5a8-6974-43d9-b890-fcd84a8e0cf2%3AA6BEB5F7-3EA0-4388-BDCA-943B133A77EC.png?table=block&id=32ee1d48-d526-80ec-9912-e0754711ee84&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

current sensing이 가장 중요함

전류를 제어하기 위해 전압을 잰다.

![](https://yechxn.notion.site/image/attachment%3A633319ca-c39c-4c8f-b587-80210b4a5041%3A305E3AB5-B927-487B-AC12-C5057B9D15A3.png?table=block&id=32ee1d48-d526-801b-ac80-f7e36d0c940f&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

shunt resistor: 매우 작은 값으로 쓴다. 1~10 mOhm 정도.

![](https://yechxn.notion.site/image/attachment%3Ae204c1cb-d3b5-44e6-81a3-5d85170089aa%3AA14356C3-8C10-4136-A1F2-923FF3CD6DB5.png?table=block&id=32ee1d48-d526-80d5-a131-d09db0fabea4&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

phase voltage margin을 1~5% 남겨야 하는 이유 = 전류를 재기 위해

전류계산해서 2개만 사용해도 되긴 하지만 redundancy를 위해 3개 사용

![](https://yechxn.notion.site/image/attachment%3A827d534b-ae5c-42a3-a2b5-decfc9700aea%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.09.28.png?table=block&id=32ee1d48-d526-809f-ae99-fbfe0c67a4c4&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

고전류 상황에서는 홀센서 또한 많이 사용한다 ⇒ 상황에 따라서 변경

low-side가 0일때만 센싱 가능 ⇒ ADC에서 값을 잘 읽어와야한다.

![](https://yechxn.notion.site/image/attachment%3Af5436a0d-7e5e-4a22-b1da-28d1830842be%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.11.43.png?table=block&id=32ee1d48-d526-80da-9d42-d2012a42f724&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

현실적인 문제 - OP-AMP를 사용해 증폭함 → 노이즈 발생한다.

회로적 low-pass-filter 구현해서 결과에 적용하는 것이 좋다.

ground 전위 자체가 떨린다 → PCB 배치 변경, ground 분리

![](https://yechxn.notion.site/image/attachment%3Ae710fb32-4bdd-4e14-b936-7a86b0e9c87d%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.19.01.png?table=block&id=32ee1d48-d526-80b4-bc1e-e2a07ed20634&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A33149fea-aa89-4f6a-8678-979141fd3637%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.19.17.png?table=block&id=32ee1d48-d526-80e5-8f2a-f95dd0428882&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

전압에 의한 전류 transfer function

![](https://yechxn.notion.site/image/attachment%3A2dcacf42-d85e-4ac3-a69c-b0a6aefbab15%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.20.09.png?table=block&id=32ee1d48-d526-8033-8d74-f15b60b441ee&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

피드백 선을 넣어서 PI 루프.

pole-zero cancellation사용해서 motor response 삭제.

전체 transfer function ⇒ 아래와 같이 나온다.

![](https://yechxn.notion.site/image/attachment%3Ae8c4d3b4-9ae3-4731-bc07-05e1255c84eb%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.22.41.png?table=block&id=32ee1d48-d526-80e5-8e33-d0ef6466a88d&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A49692755-c36f-44d7-8f08-0ba49e923b3d%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.23.04.png?table=block&id=32ee1d48-d526-80fe-8b9c-c2a36d2f3c8c&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

angular velocity ⇒ feed forward 루프를 사용한다.

![](https://yechxn.notion.site/image/attachment%3A341c5903-cef9-43e2-ac6b-1fee03a890d5%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.23.48.png?table=block&id=32ee1d48-d526-809c-b883-ed5bdf5c500c&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A55fb2de8-cbc6-46cd-8834-f298f9c57d73%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.24.08.png?table=block&id=32ee1d48-d526-8098-884e-e3640869c797&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

전체 제어 PI 루프

![](https://yechxn.notion.site/image/attachment%3A7e733920-c5f0-4ca6-b35c-573ad870d821%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.24.46.png?table=block&id=32ee1d48-d526-80fa-bd94-d3e6cdd266f4&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

적분기가 폭발하는것을 막기 위해 anti-windup을 사용한다.

backward eular, back-calculation 방식을 사용한다

![](https://yechxn.notion.site/image/attachment%3Adb1d7274-dd0d-4e2c-a5a3-fbe6fdc785f9%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.26.12.png?table=block&id=32ee1d48-d526-8035-8f22-fe72835761f0&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

현실적 한계

정확한 값을 측정하는 것이 불가능하다

feedforward 없이 시작하는 것이 좋다.

제어는 연속적이지 않다. ⇒ 이산제어

time delay 발생한다.

모든 센서는 노이즈 발생 → time delay 발생

![](https://yechxn.notion.site/image/attachment%3Aa17eb115-0deb-4382-b204-907f581831a9%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.29.12.png?table=block&id=32ee1d48-d526-8000-b262-da250995bf71&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

예상하지 못한 문제들

![](https://yechxn.notion.site/image/attachment%3A0928e8c8-cc29-4a12-91c4-320c75b1353b%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.29.47.png?table=block&id=32ee1d48-d526-8002-9b8a-f57895361fcb&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

모스펫 자체의 delay 발생한다 → dead time을 하드웨어적으로 구성

![](https://yechxn.notion.site/image/attachment%3Ab4b56051-1dbb-44b2-ab65-a3bc3195bbb2%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.30.54.png?table=block&id=32ee1d48-d526-8046-b0b9-e8df10a03cae&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

body diode - 회로에 의해 전압값이 살짝 바뀐다.

![](https://yechxn.notion.site/image/attachment%3Aa4e20109-7b94-41d1-b7db-75ebbd058ad8%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.32.54.png?table=block&id=32ee1d48-d526-8089-ab35-e98883495a5a&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

dead time 막는 방법 - 저전압 구간에는 dead time 영향이 크다

![](https://yechxn.notion.site/image/attachment%3Afd858d1f-d166-49a1-a227-75c92c87de97%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.34.56.png?table=block&id=32ee1d48-d526-80f5-b80f-f1d008f6968c&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

feedforward를 사용해서 dead time compensation을 진행한다 → 모터제어 책에 나와있다!

![](https://yechxn.notion.site/image/attachment%3A2ac2445b-900b-4cc8-8352-0b16b8d5dc01%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.36.02.png?table=block&id=32ee1d48-d526-80f6-8064-e7cb54ed8977&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

모스펫 충전 시간이 발생한다.

![](https://yechxn.notion.site/image/attachment%3A30e20386-2222-47d1-9e6c-daebbd0beb03%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.37.51.png?table=block&id=32ee1d48-d526-80b2-b6dd-c6f0de54addf&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

시간적 delay가 합쳐져서 아래 그래프와 같이 변한다.

![](https://yechxn.notion.site/image/attachment%3Ae621cf35-6ea4-4dd8-ae85-29e681efc02a%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.38.36.png?table=block&id=32ee1d48-d526-8045-a463-f16db7cb58da&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

MOSFET ringing - 전하를 너무 빠르게 충전하면 문제가 생긴다.

ringing을 줄이기 위해 다양한 방법이 존재한다.

![](https://yechxn.notion.site/image/attachment%3A07eb7981-2585-4484-8f66-e5230c50e64e%3A%E1%84%89%E1%85%B3%E1%84%8F%E1%85%B3%E1%84%85%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A3%E1%86%BA_2026-03-25_%E1%84%8B%E1%85%A9%E1%84%92%E1%85%AE_10.41.04.png?table=block&id=32ee1d48-d526-80a6-a807-c089c3cf0d38&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

위 세가지를 항상 기억하자