---
title: "Lecture 1. Actuator 설계 개론"
source: "https://yechxn.notion.site/Lecture-1-Actuator-317e1d48d52680ef890ce021b102134a"
author:
published:
created: 2026-04-08
description: "A collaborative AI workspace, built on your company context. Build and orchestrate agents right alongside your team's projects, meetings, and connected apps."
tags:
  - "clippings"
---
🤖

<video controls="" src="https://file.notion.so/f/f/f56f5713-7135-43de-ae01-354c44b36015/aafe076b-b6db-4aea-b235-454391c4a8f9/video1431534574.mp4?table=block&amp;id=317e1d48-d526-8001-b755-d7f1c440caf9&amp;spaceId=f56f5713-7135-43de-ae01-354c44b36015&amp;expirationTimestamp=1775685600000&amp;signature=WstQW99rq_rcRvHsSOR9iWO0AKFf4X4WsahX0BJ3-l8"></video>

<audio controls="" src="https://file.notion.so/f/f/f56f5713-7135-43de-ae01-354c44b36015/bfdbd638-5c6b-4fd0-9492-e87efb3b1326/audio1431534574.m4a?table=block&amp;id=317e1d48-d526-80c7-af24-fa4b0a0ca871&amp;spaceId=f56f5713-7135-43de-ae01-354c44b36015&amp;expirationTimestamp=1775685600000&amp;signature=GWsxfiP5A6SrkvR8YhVfUtvWTDkjubdFWYbHN3AZm84"></audio>

무엇이 '좋은' 모터를 만드는가?

## 0\. Lecture Introduction

@최혁 / 학생 / 의학과 ­

본 강의는 “좋은 구동기란 무엇이며, 그 성능의 물리적 한계는 어디인가”라는 질문에 답하기 위해 파레토 최적성(Pareto Optimality)의 관점에서 구동기 설계 원리를 체계적으로 다룬다.

강의는 다음과 같은 세가지 핵심 축으로 구성된다.

파레토 최적성에 기반한 설계 프레임워크

구동기에서 하나의 성능을 개선되면 반드시 성능이 희생되는 물리적 한계선이 존재한다. 구동기 설계에 있어서 용도에 부합하는 최적점을 선택하는 것이 설계의 본질이다.

Actuator의 세가지 성능 지표와 설계 3원칙

구동기의 근본적인 성능은 질량(Mass), 최대 토크(Max Torque), 출력단 관성(Joint Inertia) 세가지로 특성화된다. 본 강의에서는 이들 사이의 관계를 기반으로한 설계 원칙 —와인딩의 독립성, 드라이버 매칭, 질량·토크 고정 시 관성의 결정성—을 도출한다

보행 로봇 구동기로의 실전 적용

지면 접촉이 빈번한 보행환경에서는 고토크 모터와 최소 감속비 조합이 지배적인 설계 방향이다. 이를 모터 상수의 개념과 함께 논의한다.

## 1\. 최적 설계와 파레토 최적성 (Pareto Optimality)

@Yechan Seo

\*최적 설계 ⇒ 설계의 '좋음'을 논하기 위해서는 우선 기준이 필요

> 산악용 자전거(MTB)와 로드 자전거 중 어느 것이 더 좋은지 단정할 수 없는 것처럼, 설계 목적에 따라 최적의 지점은 달라짐.

파레토 최적 (Pareto optimality) = 하나의 성능을 개선하기 위해 다른 성능을 희생해야만 하는 상태

파레토 프런트 (Pareto Front) = 물리적 한계선상에 있는 최적 지점들의 집합

구동기 설계의 목표 = 이 파레토 프런트 위에서 사용 목적(예: 보행 로봇, 매니퓰레이터)에 부합하는 최적의 점을 선택하는 것

P = Pareto front: 어떤 목적도 희생하지 않고 다른 목적을 개선할 수 없는 해들의 집합

$$
\mathcal{P}=\left\{x^\star \in \mathcal{X}\;\middle|\;\nexists x \in \mathcal{X} :\Bigl(\forall i,\; f_i(x) \ge f_i(x^\star)\Bigr)\land\Bigl(\exists j,\; f_j(x) > f_j(x^\star)\Bigr)\right\}
$$
 ![](https://yechxn.notion.site/image/attachment%3A71f42f45-4be8-47d9-858c-7165d4051666%3A9C95EDA0-C437-47F0-ABFF-FC07809FA258.png?table=block&id=317e1d48-d526-800d-8609-ead8f5741029&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

## 2\. 구동기 성능 지표 3가지

@Yechan Seo

> Q. 그렇다면 모터의 좋음을 정의하는 Metric들은 무엇인가?

이상적인 상황에는,

![](https://yechxn.notion.site/image/attachment%3A40be71a1-aa50-452c-b681-6b29f459749b%3A4BFB24D7-161E-4D0B-88CB-6987A8DBD1C4.png?table=block&id=317e1d48-d526-801c-83c1-d27a8c23dd3e&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1090&userId=&cache=v2)

즉,

> 작은 드론 모터 + 큰 기어비 → 이론상 큰 모터와 동일한 파워 가능

그러나 실제로는 불가능.

이유는 아래 3가지 지표 때문

질량 (Mass): 구동기 전체의 무게

최대 토크 (Max Torque): 주로 발열에 의해 제한되는 토크의 한계치

출력단 관성 (Joint Inertia): 사용자가 출력축에서 느끼는 회전 관성

### ① 질량 (Mass)

스케일 법칙: Volume ∝L^3

Magnetic shear area ∝L^2

토크 생성: τ ∝Shear stress×Area×r

같은 재질 사용 시, 길이를 10배 늘리면:

질량 ↑ 1000배

전자기 전단면적 ↑ 100배

토크 ↑ 약 100배

→ 토크/질량 비율은 크기 증가에 따라 악화

즉, 단순히 모터만 키운다고 성능이 선형 증가하지 않음

### ② 최대 토크 (Thermal limit = Max Torque)

구리 열손실: P\_cu=I^2 \* R

정상상태 열평형: P\_cu=h A ΔT

표면적: A ∝L2 / 부피(열 발생): V ∝ L3

⇒ Heat generation(열 생성) ∝L3, Heat dissipation∝L2

→ 모터 크기 커질수록 냉각 불리 (최대 토크는 열로 제한됨)

### ③ 출력단 관성 (Joint Inertia)

출력단 등가 관성:

J\_out = N^2 \* J\_m+J\_gear

(N = 기어비) ![](https://yechxn.notion.site/image/attachment%3A7e4b8450-17ba-4284-b036-b5da88fc73e2%3A914AB813-10BA-409B-8B79-BD8DA268E1BB.png?table=block&id=317e1d48-d526-800f-829a-d48ab31b0d64&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1020&userId=&cache=v2)

기어비 10배 → 관성 100배 증가

Power는 유지

Torque는 증가

Backdrivability 급격히 악화

![](https://yechxn.notion.site/image/attachment%3A8339f35f-6007-4c01-9ce2-ff86b57859a2%3A664131DE-7826-43F4-8C80-4A65C5631DC5.png?table=block&id=317e1d48-d526-80a5-b97d-c0ca1386aab5&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1010&userId=&cache=v2)

QDD가 고기어비를 피하는 이유.

cf. 전기 모터는 내연 기관과 달리 이론적인 출력(Power) 한계가 없으며, 감속비를 통해 작동 영역을 자유롭게 조정할 수 있음

⇒ 따라서 단순히 출력(power)이나 최대 속도(maximum angular velocity)를 성능의 척도로 삼는 것은 오개념: 구동기의 진정한 성능을 평가하기 위해서는 위 세 가지 지표를 핵심적으로 고려해야 함

## 3\. 구동기 설계의 3원칙

제1원칙: 최대 토크 성능은 와인딩(Winding) 방식과 무관하다

@JUNE

모터의 고정자(Stator)와 회전자(Rotor)의 치수가 고정되어 있다면, 코일을 감는 방식(굵게 조금 감느냐, 얇게 많이 감느냐)은 이론적인 토크 발생 능력에 영향을 주지 않습니다.

최대 토크 성능은 모터 상수 $K_M$ 의미

자기장 세기(H)는 전류와 권선수의 곱(NI)에 비례하므로, 투입된 \*\*구리의 전체 단면적(양)\*\*이 동일하다면 발생하는 토크는 같습니다.

 $K_M = \dfrac {\tau_{rotor}}{\sqrt{I^2 R}}$ $\tau_{rotor} \propto N$ $R \propto L/A \propto N^2$ (구리 전체 양이 같다면) $\therefore K_M$ 은 $N, A$ 와 무관하다!

n, A: winding param / l\_0: axial length / B: permanent magnetic B field / r\_gap: gap radius

![](https://yechxn.notion.site/image/attachment%3Aafb0063a-edab-40fd-9848-eb4f296f94d7%3Aimage.png?table=block&id=318e1d48-d526-80d5-aa6e-db4107f8b9a0&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=540&userId=&cache=v2)

최대 토크 성능을 올리기 위해서는 1) 더 센 영구자석을 사용하거나 2) 모터의 체급을 키워야 한다! (더 큰 부피, 더 많은 구리)

제2원칙: 와인딩은 모터 드라이버와의 매칭 문제이다

@최민석 / 학생 / 기계공학부 ­

와인딩 방식(직렬/병렬, 델타/와이 결선, diameter/turns)은 모터 자체의 성능을 바꾸는 것이 아니라, 모터 드라이버가 공급할 수 있는 전압과 전류 범위에 모터를 최적화하는 과정이다.

토크 식: $T=K_t \times I$, 발열 식: $P=I^2\times R$ $T=K_t \times \sqrt{\frac{P}{R}}$ 모터 상수 $K_m=K_t/\sqrt{R}$ ![](https://yechxn.notion.site/image/attachment%3A90ccd34b-6545-464b-8624-63357eb48bca%3Af99ed95f-4c7b-4887-9c99-e497244a7f07.png?table=block&id=319e1d48-d526-8063-9cc2-e94a0bc5316b&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1340&userId=&cache=v2) 왼쪽과 같이 병렬로 연결할 경우, $K_t$ 감소, $R$ 감소. 직렬 연결의 경우 증가.

병렬 연결의 경우는 최대 전류가 큰 모터 드라이버에 적합, 직렬 연결의 경우 최대 전류는 작지만, 최대 전압이 큰 모터 드라이버에 적합하다.

![](https://yechxn.notion.site/image/attachment%3A82b0c85e-0a0e-4a84-8dce-7cf09a50d29c%3A3c77545e-3e99-4930-9aa3-0604d4fce3e8.png?table=block&id=319e1d48-d526-806a-9709-c4dd89feb194&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1260&userId=&cache=v2) ![](https://yechxn.notion.site/image/attachment%3A4861f5ff-7ea4-452f-a97f-bbc44fc02d78%3Aimage.png?table=block&id=319e1d48-d526-806f-8b09-fdf72c3eb2de&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=990&userId=&cache=v2) Delta 결선, Low turns big diameter 는 small $K_t, R$. Wye 결선, High turns small diameter는 big $K_t, R$.

즉 병렬/Delta/Low turns big diameter는 최대 전류가 큰 모터 드라이버에 적합하고

직렬/Wye/High turns small diameter는 최대 전압이 큰 모터 드라이버에 적합하다.

제3원칙: 질량과 최대 토크가 고정되면, 출력단 관성은 결정된다

@최민석 / 학생 / 기계공학부 ­

가장 핵심적인 원칙으로, 구동기의 전체 질량과 출력단 최대 토크를 결정하고 나면, 모터의 형상(피자 형태 vs 김밥 형태)에 해당하는 감속비 조합을 맞추면 이론적인 출력단 관성(Joint Inertia)은 일정하게 유지된다.

이때 구동기(Actuator)=모터+모터 드라이버+감속기 로 이루어진다.

피자 모터 (납작하고 넓음): 모터 자체 토크가 커서 저감속비 사용 가능.

김밥 모터 (길고 좁음): 모터 토크가 작아 고감속비 사용 필수. 결과적으로 동일한 기술 수준(재질, 토폴로지 등)에서 설계되었다면, 출력단에서 체감하는 관성 성능은 동일하다.

두 모터의 질량은 같다. 그런데 rotor torque가 다른 이유? 각 모터의 중심부는 비어있다고 해석할 수 있다(Shell Motor). 그 뒤 자기력 작용 면적, 토크팔 비교하면 알 수 있다.

![](https://yechxn.notion.site/image/attachment%3A36a0edb2-864c-4958-9e27-e94cb84b8010%3Aimage.png?table=block&id=319e1d48-d526-802c-89f3-ce5c644217e1&spaceId=f56f5713-7135-43de-ae01-354c44b36015&width=1410&userId=&cache=v2)

오히려 전기적 효율 측면에서는 김밥 모터가 좋다.

End turn: 코일 뭉치의 양 끝단(U자 형태로 꺾이는 부분)은 자기력을 만드는 데 기여하지 못하고 오직 저항($R$)만 높여 열을 발생시키는 노는 구리.김밥의 이득: 모터가 길어질수록(High $L/r$ ratio) 전체 코일 길이 중 이 쓸모없는 End-turn이 차지하는 비중 감소. 결과적으로 같은 구리 양을 써도 저항 대비 토크 효율이 극대화되어 모터 상수($K_m$)가 더 높은 모터를 만들 수 있다.

그러나 김밥용의 고감속 기어는 잘 설계하기가 어렵다. 하여 피자모터를 써서 기어박스가 만드는 마찰과 관성 페널티를 원천 봉쇄하는 것이 제어 성능(Back-drivability)을 확보하기에 훨씬 쉽고 빠르다.

사고 실험

동일한 최대 토크로 디자인 된 2개의 모터 생각. 모터1은 질량이 8(2x2x2). 모터2는 질량이 1 이라고 하자. 그럼 자기력 작용 면적 4배, 모터 팔 2배, 모터1의 순수 모터 출력 토크가 모터2의 8배. 두 모터의 최대 토크를 맞추려면, 모터2에 8:1 감속기를 달아야 한다.

그 경우 출력단 관성은 모터1은 $mr^2=8 \times 4 = 32$ 이라고 보면, 모터2는 $1 \times 8^2=64$. 모터1이 질량은 크지만 출력단 관성은 오히려 작다. 아래에서 추가 설명.

## 4\. 실전 응용: 보행 로봇 모터가 무거운 이유

@박경서 / 학생 / 기계항공공학부 ­

### Practical Takeaways: Legged Robot Actuation (Seok et al., 2012 + lecture)

#### 1) Legged robot에서는 output power보다 low passive impedance가 더 중요함

Ground contact가 frequent + impulsive라서 actuator의 passive impedance(= reflected inertia, friction, damping) 커지면 바로 성능 무너짐

force-control bandwidth 떨어지고 contact force tracking 망가지기 쉬움

Seok et al.(2012)도 high reduction이 torque density는 올리지만 transparency/backdrivability를 크게 해친다고 보는 관점 사용

#### 2) Efficiency: 착지 impact에서 reflected inertia가 loss를 키움

Touchdown은 quasi-inelastic impact 성격 강해서 충돌 직전 에너지가 손실로 터지기 쉬움

회전계 기준으로 ($E=\tfrac12 J\omega^2$)라서 output에서 보이는 (J)가 클수록 impact loss 커지기 쉬움Gear ratio ($\eta$)에서 $\tau_{out}\approx \eta\tau_{motor},\quad J_{ref,out}\approx \eta^2 J_{motor}$ 라서 high reduction이면 output inertia가 ($\eta^2$)로 커지는 구조

#### 3) Durability: high reduction은 drivetrain risk 키우기 쉬움

Large reflected inertia + low backdrivability 조합이면 impact torque transient가 커지고 gear에 충격이 집중되기 쉬움

Reducer(harmonic/planetary 등) fatigue, wear, backlash growth, failure risk 증가하는 방향

Paper에서도 higher gear ratios가 mass, inertia, friction loss를 추가한다고 명시

#### 4) Design direction: \*\*high-torque motor + low reduction(minimum gearing)\*\*이 유리함

Low reduction이면 reflected inertia/friction 줄어서 transparency/backdrivability 좋아지기 쉬움

대신 joint torque를 내려면 motor torque capacity가 커야 해서, paper는 gap radius ($r_{gap}$) 키워 torque density 올리고 gearing을 줄이는 방향 제시

Ideal scaling에서는 “rotor inertia 증가”와 “(\\eta^2) 감소”가 상쇄돼 reflected rotor inertia가 비슷해질 수 있다는 thought experiment도 제시

하지만 현실에서는 high reduction이 gearbox 자체 mass/inertia/friction 페널티를 얹어서 상쇄가 깨지기 쉬워서, 결과적으로 “가능한 큰 ($r_{gap}$) motor + minimum gearing” 결론으로 감

#### 5) One-line 결론

Legged robot은 contact-driven system이라 high reduction이 만든 reflected inertia((\\eta^2 J)) + gearbox friction/inertia가 efficiency·force control·durability를 같이 망치기 쉬워서, 실전에서는 \*\*high-torque motor + low reduction(minimum gearing)\*\*로 low passive impedance 확보하는 게 핵심.

### 6) “Ideal scaling에서는 kim-bap vs pizza가 reflected inertia 동일” 주장에 대한 정리

#### 6-1) Idealized argument: reflected rotor inertia 상쇄 가능하다는 thought experiment 존재함

Paper에서 “motor mass + output torque fixed” 조건으로 비교함

Radius 2× 키우면 motor length 1/2, motor torque 2×, required gear ratio 1/2 되는 식의 scaling 예시

이때 rotor inertia 4× 늘 수 있어도, gear ratio가 1/2이면 reflection이 ((1/2)^2=1/4)라서 상쇄된다는 논리 제시

결론 문장 요지: reflected rotor inertia와 output torque가 동일하게 유지될 수 있음

#### 6-2) Reality check: 실제로는 high reduction이 extra penalties 얹어서 깨짐

Ideal argument는 “rotor inertia reflection”만 본 모델

Paper가 바로 다음에 붙이는 현실 문장 핵심

higher gear ratios add mass, inertia, and friction loss 임

즉 실제 system에서는

gearbox 자체 rotating inertia 존재함

stage 증가/부품 증가로 inertia 증가함

bearings/seals/lubrication/mesh loss로 friction loss 증가함

따라서 실전에서는 “ideal 상쇄”가 깨지고, low reduction이 transparency/efficiency/durability 관점에서 유리해지기 쉬움

## 5\. 설계 평가 지표 (Motor Constant, C)

@이동호 / 학생 / 기계공학부 ­

### 1\. 핵심 지표: 모터 상수 (CC)의 정의

주어진 질량(Mass)과 최대 토크(Max Torque)가 고정된 상태에서 모터의 고유한 성능을 평가하는 지표이다

 $C = \frac{K_{m}\sqrt{Torque_{sat}}}{\sqrt{Mass}\sqrt{Inertia}}= \frac{Torque\sqrt{Torque_{sat}}}{\sqrt{Heat}\sqrt{Mass}\sqrt{Inertia}}$ $C$ 값이 클수록 근본적으로 '좋은 모터'를 의미한다. 즉, 같은 C 값을 갖는 모터들은 같은 Pareto Front에 위치한다고 볼 수 있다.

여기서 Torque\_sat은 stator의 core saturation에 의해 제한되는 토크를 의미한다.

K\_m은 단위 발열량 당 토크, 즉 Torque/sqrt(Heat)이다.

### 2\. 조건 변화에 따른 CC의 불변성

정해진 구조(Topology)와 재질을 가진 모터라면, 지름, 높이등의 dimension을 연속적으로 바꾸는 방식으로는 모터의 근본적인 성능 지표인 $C$ 값을 바꿀 수 없다.

#### Case) 모터 2개를 직렬 연결 (감속기X)

모터를 2개 직렬로 연결하면 토크($T$)는 2배, 발열($H$)도 2배, 관성($I$)도 2배가 된다.$\frac{T\sqrt{T_{sat}}}{\sqrt{H}\sqrt{M}\sqrt{I}} = \frac{2T\sqrt{2T_{sat}}}{\sqrt{2H}\sqrt{2M}\sqrt{2I}}$ 결과: 분모와 분자가 동일한 비율로 증가하여 $C$ 값은 동일하다.

### 3\. 파레토 최적 (Pareto Optimality)과 설계의 방향성

 $C$ 값이 고정되어 있다는 것은 일종의 트레이드오프(Trade-off) 관계를 의미한다.$C$ 가 고정된 상태에서 Torque를 키우려면 필연적으로 Inertia도 커지게 된다.

절대적으로 "무엇이 더 좋다"라고 말할 수 없으며 (파레토 최적 상태), 사용되는 시스템의 용도와 요구사항에 따라 설계를 결정해야 한다. (예: 높은 응답성이 필요한가 vs 강한 힘이 필요한가)

### 4\. 모터 상수 (CC)를 실질적으로 높이는 방법

단순한 스케일업(Scale-up)이나 기어비 조정이 아닌, $C$ 값 자체를 높여 '더 좋은 모터'를 만들기 위해서는 본질적인 설계 변경이 필요하다.

더 좋은 재질의 사용: rotor에 더 높은 잔류자속밀도를 갖는 Magnet을 사용한다(ex. N35 → N52). stator에 더 높은 포화자속값을 갖는 soft-magnetic material을 사용한다(ex. 규소강판 → 코발트강판)

모터의 Topology 변경: IPMSM→SPMSM→PMVM 등 자속을 토크로 변환하는 효율이 더 높은 구조로 변경.

### 5\. 설계 시 재료 배분의 딜레마 (Cu vs. Iron)

#### 구리 (Cu)와 철 (Iron)의 역할

Cu (구리): 자기적 퍼텐셜(Potential)을 만들어내는 배터리 역할.

Iron (철): 자속이 흘러가는 길(도선) 역할.

#### 철(Iron) 해석의 어려움 (비선형성)

이상적인 도선과 달리, 철은 자속이 무한정 통과할 수 없고 어느 순간 꽉 막히는 자속 포화(Magnetic Saturation) 현상이 발생한다.

이러한 비선형적 특성 때문에 계산이 어렵고, 정확한 설계를 위해서는 유한요소해석(FEA, Finite Element Analysis)이 필수적으로 요구된다.

#### 용도에 따른 재료 배분 전략

자속 포화량을 늘려 한계치(최대 토크)를 높이고 싶을 때: Iron의 비중을 높게 설계.

효율을 높여 멀리/오래 구동하게 하고 싶을 때: Iron의 비중을 줄이고 Cu의 비중을 높여 설계.

예전 필기