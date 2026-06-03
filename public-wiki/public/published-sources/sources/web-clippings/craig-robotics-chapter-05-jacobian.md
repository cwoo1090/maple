---
title: "Craig의 Robotics 5장. Jacobian 자코비안"
source: "https://pinkwink.kr/855"
author:
  - "[[PinkWink]]"
published: 2016-03-18
created: 2026-05-29
description: "최근 저는 pinkwink라는 제 블로그에 오랜 고민(하는 척 한 후 실제로는 즉흥적으로) 후에 Robotics라는 카테고리를 추가했습니다. 그리고 로보틱스적인 뭔가 글을 올리고 싶다는 생각이었는데요. 다른 여타의 로보틱스 고수님들과 달리... 바쁜 직장 생활 중에... 알고보니 전 뭐 딱히 올릴 수 있는 글의 주제가 현실적으로 제한적이더라구요.ㅠㅠ. 때마침 Python으로 시뮬레이션한 결과를 가지고 리뷰라도 해볼까 하는 생각이 최근 Craig의 책 4장까지는 어떻게 글을 올렸네요. 그런데 오늘 글은 뭔가 좀 애매하네요... 그래도 어떤 글을 작성할 때 제가 쓴 글을 reference로 거는걸 좋아하는 제 습관상 자코비안의 정의를 빼놓고 갈 수는 없으니.. 오늘도 글 자체로는 큰 의미가 없는 Craig의.."
tags:
  - "clippings"
---
[http://plckorea.kr](https://ader.naver.com/v1/gAKqP76hoYs4EGiPHX-YbVJl8y2gVsoAjskC2kxrQ5Fk603lfFfJbM6yLdMAImhkX0uS4SRJjeQHB53ep80_gq2Frz9qs-dRHLyMtZww6Okis_2ZQVaAN8ZzGFky1Ch5HG6_fCKUHyaKRGhUCLSrJrqNVbBGueqgC6J-fOh74ydaXLYm-5U5UG5rh4ulFpWbTU-1d0Eh-9bZ9U_zkJR54XX5lfrJBvJuZ4hGLanWRciKh9uE0B64T7pdg_DvBPRfFT6Vidz3_xExsGeqaK5fXBRmQNHcFdrAm0BoM5LCCpAxZncDsQn-IzN3lE__vxku1X67v9YHo_fPPy4bNfyrZpUH3aiVMcpGT5IiJsyD5z2K2-emXMSl3FUvLsHQePI175Vk-pe49rTGU-tof4JYqA==?c=tistory.ch1&t=0) 광고

[http://www.koreawifi.co.kr](https://ader.naver.com/v1/aeQYaApFJgTsr235iYc2armuP2iy_9828xvmAP5ZvdzFIyL5tvst50Rg9i0z5SXNGh9bGlMCDF_ihEib3qPm61vDp02a9Y6BBGLtvQqyZ-TlUTlqzQVBVm47NvMSDypOv46G9w55I9ohd-bQZTEHT9xJ5vIZ4DOjJx9vVMi1SBvR29eiHqJUXjk_TMYm2Ilk6fD2AD2L7l9NG5HdbB4pzyFFg8N8qPxNRhZVMCbnEUhPQ8j2msf5thj5SJ-1ESBOrMkP-w4NxUcKXGb9BDKegEQtf5xu4kubn30LZhyLqwIfQh9PB43KH4zC5kDkRkiapFxpOZq-z4bPno_2OitGStz51nqUIF9G5ePXP-wK2Df56Ree3Y-OLE_yYl-D709e8Ezg_pX3j-VYaFrnZ1cQyg==?c=tistory.ch1&t=0) 광고

[(주)한국와이파이 관급공사, 건설공사 가능](https://ader.naver.com/v1/aeQYaApFJgTsr235iYc2armuP2iy_9828xvmAP5ZvdzFIyL5tvst50Rg9i0z5SXNGh9bGlMCDF_ihEib3qPm61vDp02a9Y6BBGLtvQqyZ-TlUTlqzQVBVm47NvMSDypOv46G9w55I9ohd-bQZTEHT9xJ5vIZ4DOjJx9vVMi1SBvR29eiHqJUXjk_TMYm2Ilk6fD2AD2L7l9NG5HdbB4pzyFFg8N8qPxNRhZVMCbnEUhPQ8j2msf5thj5SJ-1ESBOrMkP-w4NxUcKXGb9BDKegEQtf5xu4kubn30LZhyLqwIfQh9PB43KH4zC5kDkRkiapFxpOZq-z4bPno_2OitGStz51nqUIF9G5ePXP-wK2Df56Ree3Y-OLE_yYl-D709e8Ezg_pX3j-VYaFrnZ1cQyg==?c=tistory.ch1&t=0) [특허, 벤처 기업용 와이파이 설계구축 전문, 공공와이파이, 행사, 이벤트, IOT 나라장터 입찰 가능 기업, 성공사업의 지름길 와이파이 프리존 구축. 견적문의](https://ader.naver.com/v1/aeQYaApFJgTsr235iYc2armuP2iy_9828xvmAP5ZvdzFIyL5tvst50Rg9i0z5SXNGh9bGlMCDF_ihEib3qPm61vDp02a9Y6BBGLtvQqyZ-TlUTlqzQVBVm47NvMSDypOv46G9w55I9ohd-bQZTEHT9xJ5vIZ4DOjJx9vVMi1SBvR29eiHqJUXjk_TMYm2Ilk6fD2AD2L7l9NG5HdbB4pzyFFg8N8qPxNRhZVMCbnEUhPQ8j2msf5thj5SJ-1ESBOrMkP-w4NxUcKXGb9BDKegEQtf5xu4kubn30LZhyLqwIfQh9PB43KH4zC5kDkRkiapFxpOZq-z4bPno_2OitGStz51nqUIF9G5ePXP-wK2Df56Ree3Y-OLE_yYl-D709e8Ezg_pX3j-VYaFrnZ1cQyg==?c=tistory.ch1&t=0)

[![](https://searchad-phinf.pstatic.net/MjAxOTA0MDNfMTk4/MDAxNTU0MjU4ODc0Nzc3.FIaz5RcyTfaF8WWwoeQrYwJ9Ge-JNgD_kjTPN8UWjy4g.9XhcuGzj6kbNexBuusmE9HTVUAiCwQQC9cX-VPcP8Vkg.JPEG/577961-b7365ca4-fdce-451d-8518-0f7c6802a885.jpg)](https://ader.naver.com/v1/GGSu-_zvAUpbeaYD9LvYqWKK1kkYYiyeLU4Bsr_xrBPYaCl2dvEnxcNdTsmCf9qtmOg_591wTZFGxaq6isXzs0PFBwUNHnCL38s3t0M4HGcl8OHU6_5T0O9T-PKv2U8jpFylpXR-VSE4mTpkeP-LWlSxr3dOTN39ugLTBq-27UpFYS6UxD2Udv9GEKxBk3dznn_5TH9fQ6W2DoGRLruJGbQuk92kNvUfazj_vxuhR27W72XsTSnlHg5a66neIwg8ajzjalEgEqNkc8JU3YWEyM2e0G-4XW9zyG1RrcZ3oYZ2iRAhhodOTKM5lMO4vRR6sBqs_c6__OAvTVnas7FHhryiA4mMDP20UFFzjLoFVEcK_QKzEMUbcaRGEyVYGOgcarauqLA1sRj6dBOlqhLz-mq8PbbmdBlMmwLq8F4EYH8=?c=tistory.ch1&t=0)

최근 저는 pinkwink라는 제 블로그에 오랜 고민(하는 척 한 후 실제로는 즉흥적으로) 후에 Robotics라는 카테고리를 추가했습니다. 그리고 로보틱스적인 뭔가 글을 올리고 싶다는 생각이었는데요. 다른 여타의 로보틱스 고수님들과 달리... 바쁜 직장 생활 중에... 알고보니 전 뭐 딱히 올릴 수 있는 글의 주제가 현실적으로 제한적이더라구요.ㅠㅠ. 때마침 Python으로 시뮬레이션한 결과를 가지고 리뷰라도 해볼까 하는 생각이 최근 Craig의 책 4장까지는 어떻게 글을 올렸네요. 그런데 오늘 글은 뭔가 좀 애매하네요... 그래도 어떤 글을 작성할 때 제가 쓴 글을 reference로 거는걸 좋아하는 제 습관상 자코비안의 정의를 빼놓고 갈 수는 없으니.. 오늘도 글 자체로는 큰 의미가 없는 Craig의 5장 Jacobian을 살짝 이야기할까 합니다.

#### Velocity ”Propagation” from Link to Link

먼저 i번째 링크에서 i+1번째 링크로 Propagation되는 velocity에 대한 이야기를 해야 합니다. Propagation 번식? 이라는 단어를 어떻게 해야할지 모르겠더라구요. 그냥 링크와 링크 사이의 속도 정의 정도로 의역하고 싶지만 그것도 아닌듯 하고...ㅠㅠ. 뭐 여하튼...

![](https://t1.daumcdn.net/cfile/tistory/246B1C4F56E790C233)

i번째 링크의 속도 벡터의 적의는 위 그림에 있습니다.

![](https://t1.daumcdn.net/cfile/tistory/236B874F56E790C732)

그리고 그걸 그 다음 링크로 옮겨가는 과정이 또 위 그림에 있습니다.

![](https://t1.daumcdn.net/cfile/tistory/246E5E4F56E790C330)

i번째 링크에서 본 i+1번째 링크의 속도는 당연히 현재 i번째의 속도에서 상대적인 추가 속도를 합하면 될 겁니다. 여기서 각속도와 z축 위치 벡터의 곱은

![](https://t1.daumcdn.net/cfile/tistory/236ABE4F56E790C334)

의 뜻입니다. 여기서 양변에

![](https://t1.daumcdn.net/cfile/tistory/236F0A4F56E790C42E)

를 곱하면

![](https://t1.daumcdn.net/cfile/tistory/2363484F56E790C439)

이렇게 각속도를 얻을 수 있습니다.

![](https://t1.daumcdn.net/cfile/tistory/2370454F56E790C52E)

같은 방식으로 선속도(Linear Velocity)를 구합니다. 여기서 다시

![](https://t1.daumcdn.net/cfile/tistory/27746F4F56E790C529)

를 곱해서

![](https://t1.daumcdn.net/cfile/tistory/2301C34F56E790C61E)

선속도를 구할 수 있습니다. 만약 선운동을 하는 경우(prismatic)의 각속도는

![](https://t1.daumcdn.net/cfile/tistory/27716B4F56E790C72E)

이고...

![](https://t1.daumcdn.net/cfile/tistory/2202B04F56E790C81E)

선속도는 위와 같습니다. 직선 운동 성분이 마지막에 포함된 형태인거죠.

#### Example 5-3

언제나 그렇듯 예제는 필요하죠^^

![](https://t1.daumcdn.net/cfile/tistory/247E954F56E790C820)

지난번에도 또 그 지난번에도 다루던 예제 two-link입니다. 여기를 속도적으로 분석해 보는 거죠...

![](https://t1.daumcdn.net/cfile/tistory/266BDA4F56E790C932)

일단 이미 이전에 \[[바로가기](http://pinkwink.kr/831)\]에서 위 변환 행렬들은 다 정의를 내렸습니다. 이제 이를 이용해서 각 선속도와 각속도를 구해봐야죠.. 일단 각속도부터~~

![](https://t1.daumcdn.net/cfile/tistory/2764B84F56E790CB35)

방금 구한 angular velocity에 대입하면 되겠지요.. 그러면 1번 링크의 각속도를 구할 수 있습니다.

![](https://t1.daumcdn.net/cfile/tistory/2577024F56E790CC29)

그 다음은 2번 링크의 각속도입니다. 각속도는 사실 two-link 시스템의 경우 직관적으로 2번 링크라면 두 각속도의 합이구나라고 유추해 볼 수 있는데 계산 결과도 그러하네요.

![](https://t1.daumcdn.net/cfile/tistory/226EE04F56E790CD2F)

3번 링크의 경우는 다음 링크가 붙어 있지 않아서 2번 링크에서 3번 링크로 변환하는 회전행렬이 Identity 행렬이라 2번 링크의 각속도와 같습니다.

![](https://t1.daumcdn.net/cfile/tistory/2519274F56E790CD07)

![](https://t1.daumcdn.net/cfile/tistory/2377D04F56E790CE28)

이제 선속도의 경우는 1번 링크는 계산 결과 0벡터이구요...

![](https://t1.daumcdn.net/cfile/tistory/216EA94F56E790CE30)

2번 링크도 전 절에서 구한 선속도 식에 대입해서 구할 수 있네요~

![](https://t1.daumcdn.net/cfile/tistory/271DE34F56E790CF02)

마찬가지 3번 링크도 그렇습니다. 이렇게 예제에 쉽게 적용이 되는군요.. 킁~~ 전체 회전행렬은

![](https://t1.daumcdn.net/cfile/tistory/2470854F56E790D02F)

입니다. 그리고. 0번에서 3번으로 바로 가는 선속도 성분은

![](https://t1.daumcdn.net/cfile/tistory/236EFC4F56E790D030)

으로 구해지네요~

#### Jacobian

만약,

![](https://t1.daumcdn.net/cfile/tistory/277DD24F56E790D122)

위 수식처럼 표현되는 시스템이 있다면 당연히...

![](https://t1.daumcdn.net/cfile/tistory/2176964F56E790D12A)

이렇게 표현이 될겁니다. 그러면...

![](https://t1.daumcdn.net/cfile/tistory/256BFB4F56E790D234)

자코비안 J를 이용해서 표현 가능하네요...

![](https://t1.daumcdn.net/cfile/tistory/216D774F56E790D332)

속도 벡터로 표현이 되니까...

![](https://t1.daumcdn.net/cfile/tistory/211B0E4F56E790D305)

이렇게 자코비안 Jacobian J를 위와 같이 정의할 수 있습니다.

#### Return Example 5-3

다시 Example 5-3으로 돌아가서 표현되어 있던 속도

![](https://t1.daumcdn.net/cfile/tistory/2479A64F56E790D426)

를

![](https://t1.daumcdn.net/cfile/tistory/276B6E4F56E790D433)

이런 형태로 표현하는 거죠..

![](https://t1.daumcdn.net/cfile/tistory/216EA34F56E790D530)

이렇게 할 수 있습니다. 그러면 위 행렬이 자코비안이 되는 겁니다.

![](https://t1.daumcdn.net/cfile/tistory/217CFB4F56E790D523)

그럼 0에서 3번링크를 표현하는 속도에 대한 자코비안은 위 수식처럼 되겠죠...

#### Changing a Jacobian’s frame of reference

자코비안에서 계를 옮기는 변환도 알아야 합니다.

![](https://t1.daumcdn.net/cfile/tistory/267FFF4F56E790D620)

좌표계 {B}에서 속도를 표현한 자코비안이 있고

![](https://t1.daumcdn.net/cfile/tistory/27082E4F56E790D619)

그것으로 좌표계 {A}를 표현하고 싶다면 선속도(v)와 각속도(w)를 같이 표현하는 경우 위와 같은 표현으로 해야 합니다.

![](https://t1.daumcdn.net/cfile/tistory/241C244F56E790D704)

이렇게 자코비안으로 표현될 거구요...

![](https://t1.daumcdn.net/cfile/tistory/26688E4F56E790D72F)

그럼 {B}에서 {A}로의 자코비안 변환은 위와 같이 표현되는 거죠...

#### Singularities

역기구학에서도 이야기했지만, 이렇게 자코비안으로 이야기할때도 해가 존재하지 않는 지점이 있습니다.

![](https://t1.daumcdn.net/cfile/tistory/266AF84F56E790D833)

위 수식을 만족하지 않는 경우입니다. 즉 자코비안의 역행렬이 존재하지 않을 때죠...

![](https://t1.daumcdn.net/cfile/tistory/25072A4F56E790D81A)

다시 예제 5-3을 보면 위 자코비안에서... 역행렬이 존재하는지 아닌지는 determinant가 0인지를 판단하면 됩니다.\[[바로가기](http://pinkwink.kr/181)\]

![](https://t1.daumcdn.net/cfile/tistory/246FBE4F56E790D930)

이 예제에서는 위 수식을 만족하면 역행렬이 존재하지 않는거죠... 상식적으로 길이(l1, l2)를 0으로 해두고 링크를 조사할 리는 없으니 결국 sin(theta2)가 0이 되면 역행렬이 없는거고... 그러면 theta2는 0도 이거나 180도면 역행렬이 존재하지 않는다고 할 수 있네요^^.

오늘은 좀 지루하고 강의.. 그것도 허접한 강의 수준도 안되는 글이지만.. 뭐 이 다음을 설명하기 위한 reference를 확인하고 정리하는 차원이었습니다~~라고 변명하고 싶어요^^

#### 'Theory > ControlTheory' 카테고리의 다른 글

| [2차계 시스템의 응답 특성 간편히 확인해 보기](https://pinkwink.kr/932) (11) | 2016.08.29 |
| --- | --- |
| [Bode Plot의 기초 중에서도 기초이야기](https://pinkwink.kr/927) (28) | 2016.08.17 |
| [역 Z-변환된 차분 방정식을 C 코드로 계산하기](https://pinkwink.kr/902) (4) | 2016.07.22 |
| [Craig의 Robotics 4장 예제. PUMA 560의 역기구학 풀이 (Inverse Kinematics)](https://pinkwink.kr/844) (14) | 2016.02.17 |
| [Craig의 Robotics 3장 예제. PUMA 560 Python으로 확인해보기](https://pinkwink.kr/838) (12) | 2016.02.03 |
| [Craig의 Robotics 3-4예제. RPR Mechanism Arm](https://pinkwink.kr/833) (20) | 2016.01.22 |
| [Craig의 Robotics 3-3예제. Three-Link Planar Arm](https://pinkwink.kr/831) (10) | 2016.01.20 |