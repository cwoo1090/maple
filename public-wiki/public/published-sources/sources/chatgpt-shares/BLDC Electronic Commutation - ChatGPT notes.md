---
title: "BLDC Electronic Commutation — ChatGPT Notes"
source: "https://chatgpt.com/share/69d9b6fe-4d5c-83aa-9c60-d51d2005aaa2"
author: "Anonymous / ChatGPT"
published:
created: 2026-04-11
description: "User-provided shared ChatGPT conversation about BLDC electronic commutation, Hall sensors, windings, brushes, commutators, and rotor position sensing."
tags:
  - "chatgpt-share"
  - "bldc"
  - "commutation"
  - "hall-sensors"
  - "motors"
---

# BLDC Electronic Commutation — ChatGPT Notes

Source: https://chatgpt.com/share/69d9b6fe-4d5c-83aa-9c60-d51d2005aaa2

This is a copy of a conversation between ChatGPT & Anonymous.

You said:
Electronic commutation circuit이모야?


You said:
Dc랑 ac가뭐야


You said:

Bldc모터에대해 더 설명해줘 controller가 어떻게
Continuously switching windings를 할수있는거야?


You said:
Winding이라는게 모야?


You said:
Bldc motor sensor ics가 무슨뜻이야?


You said:
브러쉬라는게 뭐야?


You said:
Commutator는 뭐야?


You said:
그 rotator의 위치를 정확히어케 이해하는지도 좀 더 설명해줘봐


You said:
근데 bldc에 rotator도 영구자석이 아니라 전자석이어도 되는거아니야?


You said:
https://mechtex.com/blog/understanding-the-hall-effect-sensors-in-bldc-motors
근데 이 링보면 bldc인데 rotator가 전자석이자나


You said:
아 이해가 안간다. hall sensor가 뭔지 더 쉽게 설명해줘봐


You said:
Uploaded an image
그럼 이 그림은 뭐야? 저 링크에 있는 영상에서 bldc 설명하는것같아


ChatGPT said:

좋아, 이 그림 진짜 제대로 해석해주면 한 번에 이해된다 👇
(지금까지 네가 헷갈린 부분이 다 여기 들어있음)

🔥 이 그림 한 줄 요약

👉 “Hall sensor 신호 → 코일 전류 → 자석을 계속 끌어당겨서 회전”

📷 그림을 3개로 나눠서 보자
1️⃣ 왼쪽 그래프 (전압 파형)

👉 이게 핵심이다

1번, 2번, 3번 = 각 코일(A, B, C)

전압이 + / - / 0으로 바뀜

👉 의미:

: 전류 한 방향

: 반대 방향

0 : 꺼짐

⚡ 중요한 사실

👉 BLDC는 항상:

👉 3개 중 2개만 켜고, 1개는 쉼
Texas Instruments

2️⃣ 오른쪽 코일 (1, 2, 3)

1번 코일 → 빨간색 (N극)

3번 코일 → 파란색 (S극)

👉 즉:

어떤 코일은 N극

어떤 코일은 S극

→ 전자석이 만들어짐

3️⃣ 가운데 rotor (회전자)

👉 회색 둥근거 = 영구자석

N극 / S극 있음

화살표 방향으로 회전

🔥 이제 진짜 중요한 흐름
STEP 1

👉 코일 1 = N
👉 코일 3 = S

→ rotor 자석이 그 방향으로 끌림

STEP 2

👉 controller가 전류 바꿈

→ 코일 2가 N이 됨

👉 rotor 입장:
“어? 더 앞에 더 센 자석 생겼네?”

→ 계속 따라감

STEP 3

👉 또 switching

→ 다음 코일이 N

→ 계속 따라감

🎯 핵심 원리

👉 항상 rotor 앞쪽에 자석을 만들어줌

→ rotor가 계속 “쫓아가게”

🔁 왜 “continuous switching”이냐

Hall sensor가 위치 알려줌

controller가 다음 코일 켬

이걸 반복

👉 그래서 끊기지 않고 회전

⚡ 왼쪽 그래프랑 연결

그래프는 사실:

👉 “어느 코일을 언제 켤지 시간표”

예:

1번 코일 ON

→ 조금 뒤 OFF

→ 2번 ON

👉 이 순서가 바로 회전 만드는 알고리즘

💥 진짜 핵심 (이거 하나만 기억해)

👉 “자석을 계속 앞으로 던져준다”

코일 = 던지는 자석

rotor = 그걸 쫓는 놈

🔥 왜 6단계냐?

Hall sensor 3개 → 6가지 상태
→ 6번 switching

👉 그래서 “6-step commutation”
Jkong Motor

🚀 완전히 이해됐는지 체크

이 질문 스스로 답해봐 👇

👉 “왜 코일을 계속 바꿔줘야 할까?”

답:
👉 안 바꾸면 rotor가 그 자리에서 멈춤

🎯 마지막 한 줄

👉 이 그림 = “시간에 따라 코일 전류를 바꿔서 rotor를 계속 끌고 가는 과정”

원하면 진짜 마지막 퍼즐👇
👉 “저 그래프를 실제 MOSFET 스위칭으로 어떻게 구현하는지”
👉 “왜 sinusoidal(F0C)이 더 부드러운지”

이거까지 연결해주면 완전히 끝난다.

Sources
