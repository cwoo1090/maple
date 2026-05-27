---
title: "Lecture 2. SPMSM 모델링"
source: "https://yechxn.notion.site/Lecture-2-SPMSM-31ee1d48d526808ab5bdcf43bed07768"
author:
published:
created: 2026-04-11
description: "A collaborative AI workspace, built on your company context. Build and orchestrate agents right alongside your team's projects, meetings, and connected apps."
tags:
  - "clippings"
---
🛵

<video controls="" src="https://file.notion.so/f/f/f56f5713-7135-43de-ae01-354c44b36015/00c19fa0-db96-4fe0-a828-78dab9cb17f6/video2401603710.mp4?table=block&amp;id=31ee1d48-d526-805b-b8ef-c2427bd5815a&amp;spaceId=f56f5713-7135-43de-ae01-354c44b36015&amp;expirationTimestamp=1775930400000&amp;signature=yHeW56x5jo9j_-uXja6u-0W2O7cOIK49erejtyYQkAE"></video>

<audio controls="" src="https://file.notion.so/f/f/f56f5713-7135-43de-ae01-354c44b36015/16ad5f83-e246-4d0e-990b-a14e6d238bab/audio2401603710.m4a?table=block&amp;id=31ee1d48-d526-806d-80cb-d4ac35f95fd8&amp;spaceId=f56f5713-7135-43de-ae01-354c44b36015&amp;expirationTimestamp=1775930400000&amp;signature=jY-MdmjcEWPErPlBsOzKosim-S3Qab3aoBOUDALedXU"></audio>

저번주 불변량 formula 틀림

![](https://yechxn.notion.site/image/attachment%3A79738f6a-7ac0-4a25-867d-551d78b5ebb0%3A31250697-0991-4F59-8FCA-04597A47DF08.png?table=block&id=31ee1d48-d526-8056-b681-ef1f71287f9c&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A5b6e0580-a077-4de9-b847-1728aaa6e7a6%3A1664BF5B-52C5-4BCB-8B0A-009558AFE81D.png?table=block&id=31ee1d48-d526-8084-af2a-c7e77c5d823e&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

SPMSM = 표면 부착형 자석 동기 전동기

표면부착→ 다른 곳에 자석을 붙이는 버전도 있다!

까만색 = 자석 / 회색 = 철

SynRM은 자석 없음. 철만 있다!

Reluctance torque ↔ Magnet torque spectrum에 따라 나누는 것

![](https://yechxn.notion.site/image/attachment%3A28b08b8a-0ae1-4094-9ee3-52f4f23ded50%3AE26B65D0-660E-4A75-BA34-AEEC49E10D3A.png?table=block&id=31ee1d48-d526-80dd-b0fe-e19e24387f4e&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

자석 = 화살표로 표현

Magnet torque - 당연히 전류 주면 전자석이 정렬

자석의 자기장과 전류의 자기장이 상호작용

전자석 ↔ 자석

reluctance: 자석이 없음에도, 전류 흐르면 철이 회전한다.

전자석 ↔ 철

진공보다 철이 자기장 flux가 지나가기 좋음. 특히 수평으로 기울었을 때. 아주 얇은 막대라고 가정해보기

reluctance torque = 자기 저항이 작아지는 방향으로 만드는 torque

![](https://yechxn.notion.site/image/attachment%3A0a0eeedc-eaad-49e3-8944-66e61fcf9094%3A37B2BA0B-51B8-4D8A-8EFA-0483ADB1F87F.png?table=block&id=31ee1d48-d526-801d-be8a-c97bac119c83&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

IPMSM은 robotics에서 사용하지 않는다

SPMSM (좌) / IPMSM (우)

magnet torque가 있다 + reluctance torque 존재

진공 vs 그 외 차이 = 철 안에는 여러 원자 존재 ⇒ H field가 있으면 spin이 정렬 = flux density 커짐

진공 = spin 정렬 X

철 = spin 정렬 O

철이 있을 때, 자기장이 더 세진다

But, 좋은 자석 = 이미 spin 다 정렬한 상태임 ⇒ 여기에 H field 더 쏴도, 정렬할 spin이 없음

\= 진공과 공통점

그래서 Reluctance torque = 철만 생각하면 됨 (자석은 진공처럼 취급해도 됨)

중간 자석 gap을 통과해가기가 어렵다.

경로에 대해 reluctance 차이가 존재 = reluctance torque를 낼 수 있다.

SPMSM: 완전히 symmetric하게 생김→ 어디 경로로 가던지 상관 없다.

자석이 돌아가는 방향이 자석의 정렬과 관련이 없는 것.

reluctance torque가 없다!

Stator 이빨을 따라 자기장 flux 이동

🚀

Flux 입장에서, 어떠한 경로가 가기 더 쉬운 경로인지 상상해보기!

IPMSM: 최대 토크는 SPMSM보다 크다.

자석을 안에 비대칭적으로 넣어놨다고 IPMSM은 아니다.

정의 = reluctance torque를 이용하는 구조의 motor 를 의미.

EV에서는 IPMSM 많이 씀

## SPMSM modeling

![](https://yechxn.notion.site/image/attachment%3Ab2fb9f64-756b-42e0-b819-59bc29a8a190%3AD3D87894-B8F3-472C-91B8-8419568011ED.png?table=block&id=31ee1d48-d526-80eb-95a3-fd7474d6bac5&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

Hard magnetic: c~f 간격이 넓다

Soft magnetic material: c~f 간격이 좁다

H = 0일 때 (current = 0일 때)→ c~f gap

(철을 자석으로 비비는 것 생각)

거의 gap이 0이므로, 그냥 a→ b 곡선으로 봐도 됨.

spin은 포화되면 곡선으로 꺾임

🚀

그래서 전류 - 토크가 정비례하지 않는다

B-H curve 의 hysterisis 때문이 아니라, B-H curve의 nonlinear 특성 때문이다

태규형은 3차함수로 근사

![](https://yechxn.notion.site/image/attachment%3A0a0ef2d5-1930-48c4-9a60-2555a1c4eba1%3AABCD733E-D5AB-4B57-B1C9-A9834382283D.png?table=block&id=31ee1d48-d526-801e-9905-d125d451c081&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

Brushed DC motor modeling부터 할 줄 알아야 한다.

![](https://yechxn.notion.site/image/attachment%3A875304d8-ceac-4a2b-9604-a24364e25a60%3ACFAF2D8A-AA34-4CC4-BC53-42E78E25A5EB.png?table=block&id=31ee1d48-d526-8034-bb81-c207b30dbcb7&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1190&userId=&cache=v2)

Kb = Back EMF (역기전력) = 내가 넣는 전압이랑 싸우는 방향

시간 term 사라짐 ⇒ MOR을 그릴 수 있게 된다

## MOR (Motor Operating Region)

![](https://yechxn.notion.site/image/attachment%3A56645c90-8e3f-4be6-9178-a633daac7a6f%3A07E93E75-9166-4EA2-B576-F60F7931AA7D.png?table=block&id=31ee1d48-d526-8084-a584-e8bddbce8b0d&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

강화학습 환경 안에 이 MOR이 구현되어 있어야 한다.

🚀

평행사변형 이다.

육각형 아니다!

Motor는 보통 양의 일을 한다.

음의 일을 하지 않음 (에너지를 흡수하지 않음)

에너지 흡수 = 회생제동 ⇒ 이 영역이 삐쭉 튀어나가있다 (대칭 아님)

단자 간 전압차 (V) - brushed: 단자 1, 2만 있다

이거로 자르면, 좌우로 자르는 것 (hard constraint)

단자 사이 전류 (i)

이거로 자르면, 위아래로 자르는 것 (soft constraint) - 사실 사람들이 임의로 정하는 것임

발열량 ~ i^2 에 비례 하므로 imax를 정해준 것

![](https://yechxn.notion.site/image/attachment%3Aeab7789b-b945-4d28-9001-6e2de6b9e970%3ADC6BA10C-6507-4AAD-AE7E-EDDAB003DF74.png?table=block&id=31ee1d48-d526-8013-bc08-cd7ae020308e&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A517a1ca6-0d7a-40cb-85f8-e4c2d8a50dfb%3A081C4BC3-67F0-44AD-ACD3-7416C004BD70.png?table=block&id=31ee1d48-d526-8069-93a5-f2e37773ce85&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

빨간 선 = 등전압선

Vmax 넘을 수 없지만, 현실적으로는 가끔씩 넘어간다

우리가 쓰는 배터리 = 양의 일을 하면 전압이 예상보다 떨어짐 ⇒ 실제 한계 안쪽으로 들어온다.

음의 일을 하면 극단적 회생제동 (매우 동적 실험) 하면 100V→ 120V까지도 올라감

리튬 폴리머를 쓰자~

![](https://yechxn.notion.site/image/attachment%3A77112c0c-3c09-4597-993d-df11cb177974%3A0A260E86-6EB4-412E-9C50-220962FA908D.png?table=block&id=31ee1d48-d526-805b-9523-ea32c684cad5&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

전압, 전류가 scalar가 아님→ 단자가 a b c

키르히호프법칙: 자유도 1 뺌

3자유도 - 1 = 2자유도

⇒ V, I가 2차원 vector가 됨

D-Q coupling

모터제어 책에 나옴

![](https://yechxn.notion.site/image/attachment%3A469bc924-7f3f-4664-92f3-40d0842f5ac0%3A6CD698D4-BD8A-450B-BB5F-550E2EBDAA81.png?table=block&id=31ee1d48-d526-8062-be89-e4185671dd06&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

전기차: 기전력 튀어나가는 것 막아서 토크 더 쏘게 하는 테크닉 있음.

발열 1도 신경 안쓰고 MOR의 한계를 생각하며 최대치를 뽑는 것 = 파란색 curve

대부분의 로봇은 field weakening control 안함..

한계영역 조차도 ~ 앞 식 있어야 구할 수 있음

D축전류, Q축 전압??

![](https://yechxn.notion.site/image/attachment%3Aafdee044-6b38-45d4-9aed-a00e92fb920d%3A8BDF3819-A66D-4054-8A00-7A8DE9175A3B.png?table=block&id=31ee1d48-d526-8005-8eb7-cfa18d737d42&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

한계영역을 긁는 policy를 쓴다? Sim2Real 할 때 Sim에 이 그래프 꼭 구현해줘야 한다.

urdf: 최대 torque, 최대 rpm만 있음 (빨간색 빗금 친 곳 못 간다)

![](https://yechxn.notion.site/image/attachment%3Aa13989a7-ee0c-4fef-94ca-9f8acfa8e3ba%3AC1C38632-CB2C-4EE3-84AE-1C9DDA58FCBB.png?table=block&id=31ee1d48-d526-8061-8f6a-c32e84b40ab3&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1260&userId=&cache=v2)

torque는 state가 아님→ 언제든지 도달 가능

velocity는 state임→ 순간적으로 도달 못함 (무한한 가속도가 있지 않는 이상)

🚀

Sim2Real에서 MOR 모델링이 매우 중요하다!!

![](https://yechxn.notion.site/image/attachment%3A9aab0770-7999-485a-9fc9-75a7b4e29ec8%3A83EA2693-A3CE-4847-8609-14945D51263F.png?table=block&id=31ee1d48-d526-80cd-be59-ef5c17100576&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

이건 그렇게까진 중요하진 않음

## 여기부터 숙제

![](https://yechxn.notion.site/image/attachment%3A8753bb5b-b845-4d64-96b0-055c25d805ef%3A10EC9441-1CB6-46A6-B4AB-27B6885E5752.png?table=block&id=31ee1d48-d526-80d5-95c6-e73afd3c3e23&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3Ac9c5bc6e-1df7-4cb8-949b-8b87ce356dd4%3A075D21FA-2CFE-41CC-9123-46B3F08E4662.png?table=block&id=31ee1d48-d526-8041-8cb2-fa8182cc44b8&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

이 수식 진짜 무조건 외워야 함 (형태 외우기)

d축 전압 = d축 전류 IR + d축 전류 Ldi/dt + q축전류 \* 각속도 \* Ls

cross-coupling term ⇒ 이것때문에 SPMSM이 brushed DC motor와 다른 것!!

![](https://yechxn.notion.site/image/attachment%3Ad8bd7111-bea4-4ac3-8227-c46bba1a169c%3A1D2B6223-77B7-4C23-ADFB-03AC47DA0805.png?table=block&id=31ee1d48-d526-800e-8fde-c32517cfcbe5&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

전류센서, 토크센서 없어도 가능

오실로스코프, SPMSM 만으로도 토크 상수를 계산 가능

힌트= 모터 살 때, 토크상수, 속도상수 같이 적혀있음 (Kb = Back-EMF)

Stator ~ Rotor 사이 공극 지름 28 / Stator 높이 06 ⇒ 2806

Kv: 1볼트(V)에 대한 분 당 회전수(RPM/V)

![](https://yechxn.notion.site/image/attachment%3Acdba6f80-4a4e-49aa-8539-ef3ff143e69b%3A6585AACE-D84E-4602-BBEF-B04B100985E6.png?table=block&id=31ee1d48-d526-8072-a97c-ceef2747d69c&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

책대로 하세요~

![](https://yechxn.notion.site/image/attachment%3Af81bf468-c0f8-4790-8090-f45fc106ee76%3A949276BE-5CD3-4737-ACDC-A7DD5B4A71D1.png?table=block&id=31ee1d48-d526-8005-b9bb-e36706116f4a&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

star (wye) version: 중성점이 가운데

delta version: 중성점 없음

⇒ 등가회로로 나타낼 수 있음

But, 대부분의 모터는 Wye circuit으로 구현되어있음

![](https://yechxn.notion.site/image/attachment%3Abb68b132-5992-413a-9c54-ba3baee77ab4%3A33FF01A1-6BAD-4EDA-9011-129E6CCE4BD9.png?table=block&id=31ee1d48-d526-8080-8d2f-f29faf055b1c&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

Star 권선 vs. Delta 권선 구분해보기!

![](https://yechxn.notion.site/image/attachment%3A12935922-4560-4168-9f50-ff7749e98eca%3AB4476ED5-F941-4D01-87D2-8693B55E4A66.png?table=block&id=31ee1d48-d526-8015-8c33-dc5247c2e388&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

3\*3: 전류, inductance

magent 이 마지막

![](https://yechxn.notion.site/image/attachment%3A3dac67e8-54ca-46a8-8295-2ba19f10aa12%3ABF361E5C-AB21-4849-A105-F89432F788E3.png?table=block&id=31ee1d48-d526-8060-aa09-c1b91022b40b&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3Ae48a514b-89d6-4982-96a6-f1297513bacd%3A3F6E8C47-222F-4B9D-9D1B-8AACB44ED6E7.png?table=block&id=31ee1d48-d526-801a-9ed3-d3f847264319&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A22c972ea-e302-4adc-80d2-54b65ee98902%3A9C4625BE-2EE8-44D1-A824-DB17D8A83D38.png?table=block&id=31ee1d48-d526-80e5-aced-cd88959daa2e&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=800&userId=&cache=v2)

책 예시: 선이 6가닥, 자석도 1개→매우간단

![](https://yechxn.notion.site/image/attachment%3Af806aded-bc9e-423e-ac36-3e8c62dbee54%3A78D1B31E-CD69-40E9-B099-A0CC26020D7C.png?table=block&id=31ee1d48-d526-80c7-bce1-f9c92827755c&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

어떻게 d, q축을 정의해야 할까?

편의상 곱해둔 상수들이 어디있는지 생각해보기.

![](https://yechxn.notion.site/image/attachment%3A9306277a-139a-4c09-aac4-9982b808b4a8%3A01454F16-BC68-4431-B770-57720B5BDF02.png?table=block&id=31ee1d48-d526-80b6-ba3f-f1573a56e807&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A2cbd722d-ebd0-47f0-acab-0d2f8a45d893%3A0008E9AD-EC55-4E08-AD92-5ACB32F2A6AA.png?table=block&id=31ee1d48-d526-801a-b828-e0c5586efcd9&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

선형근사가 엄청 많음 ⇒ 선형 아닌 세상에서는 saturation 됨

모든게 B-H curve의 nonlinear 특성 때문임

실제로 맞는 term 과 / 비선형성으로 인해 맞지 않는 term이 있음 ⇒ 무엇일지 생각해보기!

![](https://yechxn.notion.site/image/attachment%3Ae0ebe0f2-ce6a-4cc7-bb2b-c425dc4a70d9%3AEC8424A0-EF6D-4440-AAD8-33D866AE0487.png?table=block&id=31ee1d48-d526-80a7-9d3a-e103c3424dfd&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1020&userId=&cache=v2)

🚀

과제: 2주 뒤까지