---
title: "Lecture 4. Actuator Optimal Design - Actuator Design Process (1/2)"
source: "https://yechxn.notion.site/Lecture-4-Actuator-Optimal-Design-Actuator-Design-Process-1-2-335e1d48d5268033b752fafb1315cf03"
author:
published:
created: 2026-04-25
description: "A collaborative AI workspace, built on your company context. Build and orchestrate agents right alongside your team's projects, meetings, and connected apps."
tags:
  - "clippings"
---
<video controls="" src="https://file.notion.so/f/f/f56f5713-7135-43de-ae01-354c44b36015/ec24bc37-1872-4fa5-b708-bd10785b8558/video2368778208.mp4?table=block&amp;id=335e1d48-d526-80f3-af87-e42833a31c82&amp;spaceId=f56f5713-7135-43de-ae01-354c44b36015&amp;expirationTimestamp=1777068000000&amp;signature=M2ELeFp6C909uvNXm80Fcc3HYjAh38L6ljPS5vlGrw0"></video>

<audio controls="" src="https://file.notion.so/f/f/f56f5713-7135-43de-ae01-354c44b36015/d76714bd-1f2c-42d0-a72f-e8f8c1127bc6/audio2368778208.m4a?table=block&amp;id=335e1d48-d526-8065-9fb7-db5d4706c21e&amp;spaceId=f56f5713-7135-43de-ae01-354c44b36015&amp;expirationTimestamp=1777068000000&amp;signature=ihV5yGm33l9K5DyohHVvsXnJQFSWrVoYBCcv0jZ2vag"></audio>

Lec4.pptx

1.9 MiB

![](https://yechxn.notion.site/image/attachment%3Ab92fcf80-8767-464d-a37f-c1698e12e1e3%3Aimage.png?table=block&id=335e1d48-d526-8002-8831-c80d3aa8a85a&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

너무 fundamental 감성

실전 향기가 그립다

오늘은 실전 위주로 수업

![](https://yechxn.notion.site/image/attachment%3Af8819aa9-5804-4e66-9194-e95a80144ca9%3Aimage.png?table=block&id=335e1d48-d526-807e-a716-d1e81b87d1ce&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

구동기 설계의 상위단계

Define Requirement - 구동기가 맞춰야 하는

조건

들을 어떻게 정의하는가?Define

T-M-I

Select

Reducer Type

: 어떤 감속기 type을 쓸 것인가

Design Reducer ⇒ 이건 Lecture 5

Design Structural Components ⇒ 이건 Lecture 5

![](https://yechxn.notion.site/image/attachment%3A11a62eb5-774b-4c91-a045-d9a6dd18b40c%3Aimage.png?table=block&id=335e1d48-d526-80f2-bebe-d415fcf1a3c9&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

requirement가 반드시 먼저 정의되어야 한다.

Pareto front를 밀어 올리는 것이 문제가 아니다. ⇒ 이건 다른 문제임

이건 좋은 베어링, 카본 소재, 더 좋은 motor topology … 이런 문제

감속비 높을 때도 backdrivability 높일려면 감속기 퀄리티가 높으면 됨

Pareto front line 위에서, 어느 위치를 고를 것이냐가 문제임!!!

\= 어떤 로봇을 만들 것이냐 (ex. MTB 자전거 vs. 로드자전거)

![](https://yechxn.notion.site/image/attachment%3A013236da-4b75-4192-953f-d86a602aab75%3Aimage.png?table=block&id=335e1d48-d526-8059-9c3e-f5b6c2c2a00c&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

Lecture 1, 2에서 2번이나 잘못 말씀하심… 오우

요즘 연구 중이신 내용 - 검증이 덜 됨

총 4DOF다!! 이게 맞음 (Lecture 1, 2 내용 수정)

Pareto front line 위에서는, 4DOF 중 하나가 올라가면 나머지는 낮아질 수밖에 없음 (종속변수 관계)

4DOF =

Mass, Rated Torque, Inertia, Peak Torque

\= 무조건 Trade-off

맥스웰 방정식의 제한 안에 있는 변수들

But,

Backlash, Volume, Stiffness, Velocity(Power)

\= Trade-off 없이 올릴 수 있다.

가공정밀도 극한으로 올려서 공차 0이 되면 가능!

Backlash는 가공자의 역량임… 맥스웰 방정식의 제한 하에 있는 변수가 아님!

올리려면 충분히 올릴 수 있다.

![](https://yechxn.notion.site/image/attachment%3A2b991832-e63f-43fc-b8e1-632222eb0a30%3Aimage.png?table=block&id=335e1d48-d526-80c1-8216-c688005c3437&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

찐찐찐찐찐 최종 식 → 4DOF 간 종속관계 정해져있다!

같은 회사 20개 Actuator C 다 계산해봄! ㄹㅇ 상수임!

순수 구리질량 = mass of copper→ 전체 질량으로 봐도 비례해서 얼추 맞긴 함

후속 연구하고 계심

4자유도지만, 공식 1개 있으니 3DOF다.

근데 여기서 하나 더 빠짐 ⇒ 대부분의 경우엔 Motor 사서 씀

motor constant = sqrt {단위발열량} 당 토크 (rated torque) = 주어진 방열 조건에서, 정상상태 유지하는 발열량을 쏠 때 내는 토크

torque limit = peak torque = saturation torque = 발열을 완전히 무시했을 때의 토크

motor constant와 torque limit은 보통 얽혀있다

따라서

torque, mass, inertia

고려하면 되는데, 식 1개 있으니 이 중 2개만 결정하면 됨! (Lecture 1 결론과 같음) ![](https://yechxn.notion.site/image/attachment%3A2dc80450-eee4-4f68-b152-cd8a742fe255%3Aimage.png?table=block&id=335e1d48-d526-8052-bdcc-fbbd1d8de19a&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

QDD-based Humanoid 로봇을 만들겠다면?

Kinematic parameter 결정 - 로봇 키, 두께, … 등

Rated/Peak Payload 결정 - 어느 정도의 물체를 들어올릴 것인가.

그 후엔 끝단부터 구동기 스펙 결정

wrist 3DOF

TMI

forearm

M

elbow 1DOF

TMI

upper arm

M

shoulder 3DOF

TMI

![](https://yechxn.notion.site/image/attachment%3A4381eef7-9301-4c4c-b82b-ee4ce8edd51a%3Aimage.png?table=block&id=335e1d48-d526-80ca-9f58-e96da23c8ac8&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

🚀

T→M→I 순서대로 정한다

![](https://yechxn.notion.site/image/attachment%3Ab1777074-8301-43d5-bd43-ad57c3a25142%3Aimage.png?table=block&id=335e1d48-d526-80a9-8aec-e7895ee03381&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

## 1\. Torque 결정

Rated torque = 계속 들고 있어도 괜찮아야 하는 payload 결정

Peak torque = 짧은 시간 transient하게 내는 payload

child frame 기준 rated / peak torque 계산: Jacobian 으로 하면 됨

작업공간 안에서 낼 수 있는 payload 기준이다

fixed면? 복잡복잡

mobile이면? 어차피 그 configuration 안에서만 계산하면 되므로 좋다!

![](https://yechxn.notion.site/image/attachment%3A0d6f191b-3c82-4b3d-8b71-6b3fd7fc0918%3Aimage.png?table=block&id=335e1d48-d526-80e6-ad68-ec15d486320b&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

## 2\. Mass 결정

Motor 사서 쓴다 (off-the-shelf framless motor)

정적 상황에서만 고려한다 (dynamic 고려 X)

⇒ 이 가정 시, 다음을 고려

motor는 가벼울 수록

좋다

감속비는 최대화

(QDD topology로 제작 중이므로, 기어비 limit 존재)

QDD 설계사상 = 토크센서 없이 토크 알고 싶다는 것

마찰 작아야 함 (마찰토크 최소화)

마찰이 작아서 제어에 방해만 안되면 QDD

임.

준-직접구동기: 거의 그냥 DD급이라는 것

일반적으로는 감속비가 작아야 한다는 뜻을 내포하긴 하는데,

사실 감속비가 높아도 QDD 사상이 유지될 수 있음.

1:100이더라도 감속비 퀄리티 높으면 backdrivable 가능!

joint velocity

w/ given battey V 확인!

이건 구리 단면적에 흐르는 전류 양이 핵심인데 (motor driver의 winding)

사서 쓰는 경우, winding 직경/turn 수를 조절할 수가 없다

사서 쓰는 경우에는 조절 못하니까, 1&2 맞추고 3번은 확인

구리양(단면에 흐르는 전류 양)

이 중요 ⇒

motor driver의 winding

이 결정

그래서 3번은 사서 쓰는 경우에 추가적으로 확인 정도 해보라는 것.

Actuator 전체 mass가 중요

감속기 만들어보면, 100:1 이든 10:1이든 중간 기어는 전체 중량에 영향 X

But, 출력단의 기어 ⇒ 출력 최대토크 결정함. 이게 전체 중량을 결정

![](https://yechxn.notion.site/image/attachment%3Af744a271-b97c-4f28-b806-fcc7d4d2945d%3Aimage.png?table=block&id=335e1d48-d526-80a7-b3ec-ca16f3190633&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

torque 결정됨

mass도 결정됨

⇒ rotor inertia 결정됨

⇒ out inertia를 너무 무시하면 휴보처럼 됨

감속비만 결정 가능

고감속비 = 충격 시 잘 부서짐, 둔중하다

Jout=N^2 \* Jr

🚀

Static Actuator 선택 방법 정리

Robot configuration 결정

Payload 결정 → Torque 계산

말초부터 mass 결정 ⇒ torque 결정 ⇒ mass 결정 ⇒ …

감속비는 정해둔 QDD topology 안에서 최대화하기

![](https://yechxn.notion.site/image/attachment%3A0e964700-9b7c-4ec7-899e-a4e039298fd2%3Aimage.png?table=block&id=335e1d48-d526-80ae-8acc-f1db5c3def2d&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

Dynamic system은 어떻게 할까?

관성항을 고려

최대 각가속도 최대화

(최대속도가 metric이 아님)

감속비가 너무 낮으면 motor 입장에선 너무 무겁게 느껴진다.

임계 감속비 이상이어야만 한다

static ↔ dynamic performance의 trade-off 존재

1-DOF 이상 = 앞으로 할 연구

🚀

1-DOF 증명 만 기억하고 활용해보세요~

## 감속기의 종류

![](https://yechxn.notion.site/image/attachment%3Ae66d23c9-0b66-47e7-b5d2-7d81b9d1f0e9%3Aimage.png?table=block&id=335e1d48-d526-8046-bc40-cc840147951e&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

Planetary drive

이것만 좀 variation이 많다

single-stage, 2-stage, 3K-compound, …

Cycloidal drive

Harmonic drive

Reducer의 primary requirements

(1) Torque density = 견딜 수 있는 최대 torque / mass

(2) Efficiency = 나온 power / 들어간 power

이 2개 사이의 trade-off가 있다

Secondary requirements

(1) Backlash

차량에선 안중요함. 전진/후진할 때 mm, cm 단위로 중요하진 X

backlash를 tight하게 잡아버리면, 고속도로 주행 시, 열팽창→ 기어 낑김→ 기어 다 닳아서 금방 망가진다

But, 로봇은 몇시간 달리진 않음

로봇에선 중요하다

위치제어를 정밀하게 해야하니까

![](https://yechxn.notion.site/image/attachment%3Aaecd44c8-6011-42c8-beac-a55f813d0ad5%3Aimage.png?table=block&id=335e1d48-d526-80b6-8288-fbbf235b5f42&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

Back-drivability의 정의란?

ex. 우리가 쓰는건 BLDC가 아니라 엄밀하게 SPMSM임.

용어를 막 쓰기 시작

용어의 근본 시작 = MIT 치타 1 설계 논문

Backward-Efficiency

forward / backward rotor efficiency가 다르다 (신기신기)

병뚜껑 정방향/역방향 돌리는게 다른거랑 비슷

forward는 0이 되지 않지만,

backward는 쉽게 0이 될 수 있다.

Coulomb friction

최대정지마찰력에 해당하는 토크

\= reverse drive starting torque (backward-efficiency와도 연결되는 개념)

Joint inertia

이걸 의미한다고는 보지말자.. 태규형 주장!

![](https://yechxn.notion.site/image/attachment%3Ae4b4cacd-b846-47c1-b27c-5a8dc1068e25%3Aimage.png?table=block&id=335e1d48-d526-8087-9dd3-c9e077f8c943&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

왜 그냥 직렬로 기어 쭈루룩 잇지 않을까?

동축 설계가 안됨

기어 간 moment 주고받을 때, 축이 radial moment를 받는다.

결국 이 radial load는 축이 견딘다 = 두껍고 튼튼한 것 써야함

이거 좀 포기하면 어떻냐? 가 아니다! radial load에 해당하는 마찰이 있음.

Sun gear는 동축

마찰 0이다→ good!

마찰손실이 없다.

Efficiency를 높이는 것이라고 생각하기

![](https://yechxn.notion.site/image/attachment%3A7fe0b8c3-f6ee-43d6-981f-f76ae3c1e4f3%3Aimage.png?table=block&id=335e1d48-d526-802b-b3e4-d402fea9b467&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

각 감속기 구조만 보고 넘어갑시다~

장점

디자인하기 쉽다

efficiency 높음

단점

감속비를 높이려면 sungear를 작게 만들어야 함 (감속비에 한계 존재)

최대 torque density가 낮다

언더컷 = 치 개수를 17개 이하로 못 만듦: 덜 필요한 진동, 출력으로 인해 마모됨

배선할 때 곤란 (어딘가에 찝힐 가능성 있어서 숨기기 힘들다) ⇒ 보통 sungear 가운데 구멍 뚫고 배선 빼는데, 종종 문제 생김 + sun gear 작게 만들어야 해서 한계 존재

![](https://yechxn.notion.site/image/attachment%3A8b68d237-865b-4e81-8256-2ef35fc5c2b7%3Aimage.png?table=block&id=335e1d48-d526-8025-af06-dedb29942c31&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

panetary 18:1을 2단 쌓아서 36:1 된 것

입력단보다 출력단이 받는 torque가 훨씬 커서, 출력단 감속기의 질량이 더 크다

장점

효율 좋음 (3K-compound보다)

단점

감속비 제한됨 (밑도끝도없이 올릴 수 없다)

parts가 많다

torque density 낮다

무겁고 bulky하기 때문

![](https://yechxn.notion.site/image/attachment%3A20423041-674d-4247-959b-d8b90fa9972b%3Aimage.png?table=block&id=335e1d48-d526-80ab-998c-e02c6609551f&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

위랑 아래가 이빨개수가 다름

감속비 조절을 아무렇게나 할 수 있음 (이론적으로는 무한도 가능)

장점

감속비 range가 넓다

torque density 크다 (2-stage PLD보다): 가볍기 때문

단점

효율 낮음: 같은 수준에서, 2-stage PLD 보다 전력 효율이 낮음 ⇒ 계산 과제!

![](https://yechxn.notion.site/image/attachment%3Af61acc43-e782-4310-8956-b4bf6c7ecba0%3Aimage.png?table=block&id=335e1d48-d526-803d-aa7d-c14648e7fc5e&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

planetary: 내접-외접 기어가 맞물리는 순간 rolling이 되고, 그 외에는 다 sliding이다

이렇게는 일정한 비율로 동력전달 못함

Cycloidal drive = 이론적으로는 강체 + 표면 마찰계수 무한 (rolling이므로)

장점

효율 높음: sliding 없이 rolling만으로 동력 전달

단점

제작할 때 매우 높은 precision 요구함

공간이 매우 빡세게 배치되어있음 - 공차가 매우 정확해야 함

압력각 - 맞물릴 때의 중심 축 간 직선각도 ⇒ 압력각이 90도가 되어버리면? 물린다.

압력각이 두껍기 때문에 공차에 예민한 것.

#연구실에서 석박대학원 하면서 만들 수 있는 수준이 아님… ⇒ cycloidal drive 직접 만들려 하지 마라… 외주맡기기

PLD: 공차 빡세게 안 맞춰두면 3 points contact이 다같이 맞물리는 순간 마찰 엄청 생기고 망가짐

Cycloidal: 모든 contact points가 잘 맞아 떨어져야 함 - 엄청난 manufacturing skill 필요

![](https://yechxn.notion.site/image/attachment%3Acc6768cb-8028-4daa-839f-2462de906737%3Aimage.png?table=block&id=335e1d48-d526-8015-9a83-f40a404de0dd&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

Harmonic drive

장점

Torque density 높음

단점

효율 낮음

항상 물려있음 - load를 온 이빨이 다 견디고 있다.

같은 철 무게로 만들어도, 훨씬 큰 출력토크 견딤 = backlash 없다.

접촉면적 늘어날수록 마찰 증가 = 효율 떨어짐. (preload, 업체 실력따라 다르긴 함)

design & manufacturing 매우 어려움

얇게 만들면 깨진다

물렁하게 compliance 줘서 만들면 이빨이 나감

flexible 한 부분은 물렁하면서도 + 열처리 해줘서 경하게 만들어야 한다.

하모닉은 전문 업체가 만들어야 함. 사서 쓰기! 만들기 힘들다!

장점은 많지만, 만들기 힘들다.

CNC식 로봇 시대에선 하모닉이 최고였음

마찰을 씹어먹을 정도의 강력한 위치제어 PD제어 하면 끝! 이었음

마찰 = 제거할 외란 으로보고 제어했음

QDD식 로봇 시대

마찰을 최소화하고자 함

강화학습 제어 로봇 중 하모닉 기어는 거의 없다.

했더라도 RL 성능 낮았을 것

![](https://yechxn.notion.site/image/attachment%3Aede63d84-8f58-40d4-a88f-9e9ecfa3902e%3Aimage.png?table=block&id=335e1d48-d526-80e0-a8df-cead7c2bd013&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)