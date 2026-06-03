---
title: "Outrunner Brushless Motor vs Inrunner Motor for Drone"
source: "https://www.ligpower.com/blog/outrunner-brushless-motor-vs-inrunner.html?srsltid=AfmBOooPj9NQcNSHtnE5N8F4uxWh44gm5OO_wsiV7oRlKJ1dSYYXmfSd"
author:
  - "[[ligpower]]"
published:
created: 2026-05-28
description: "Want to explore what outrunner and inrunner brushless motors are and learn their differences? Click to view the full content."
tags:
  - "clippings"
---
In the drone propulsion system,the brushless motor is the core component determining flight performance.Based on structure,brushless motors are primarily divided into two types:Outrunner and Inrunner,which exhibit significant differences in power output methods,applicable scenarios,and structural characteristics.

Understanding the differences between Outrunner and Inrunner motors helps in selecting the appropriate motor solution according to mission requirements,thereby enhancing the drone's efficiency,stability,and reliability.This article will compare the two motor types from aspects such as structural principles,performance characteristics,and application scenarios,and provide practical selection references.

![Outrunner-drone.jpg](https://www.ligpower.com/images/202508/Outrunner-drone.jpg "Outrunner-drone.jpg")

**Full-Text Core Summary：**

Outrunner and Inrunner brushless motors for drones exhibit significant differences in structural layout,performance characteristics,and applicable drone domains:

**Outrunner:**Employs a design where the rotor rotates integrally with the housing,with magnets located on the inner wall of the housing.It offers advantages such as high torque output at low speeds,direct drive capability for large-diameter propellers,and precise throttle control.Commonly used in multi-rotor aerial photography drones,FPV racing drones,long-endurance platforms,and industrial drones.

**Inrunner:**Places the rotor inside the motor,with the housing stationary and magnets located on the rotor surface.It can achieve extremely high speeds and high power density within a smaller volume.Suitable for ducted fans(EDF),high-speed applications with small propellers,propulsion systems with space constraints,and engineering solutions requiring gear reduction to drive large propellers.

## I.What are Drone Outrunner and Inrunner Brushless Motors?

The brushless motors used in drones are mainly divided into two categories:Outrunner and Inrunner.The core difference lies in the position of the rotating component and the magnet/stator layout,which directly affects the torque-speed characteristics,installation methods,and typical application scenarios.

### 1.Drone Outrunner Brushless Motor

**Structure and Principle**

The"rotor"of the Inrunner motor is concentrically arranged internally with the shaft,while the housing remains stationary.Permanent magnets are attached to or embedded within the rotor core,and the stator windings are distributed within the slots on the inner side of the housing.The load is connected via the shaft through couplings,gears,belts,or fans/turbine impellers.

**Performance Characteristics**

Can output relatively high torque at low speeds,suitable for drones directly driving large-diameter/high-pitch propellers.

Relatively simple structure,short transmission chain,high overall efficiency,smooth thrust output,facilitating drone attitude control.

Maximum safe speed is relatively lower than Inrunner motors;requires attention to thermal management during prolonged high-power operation.

**Significance for drones**

Structure and principle dictate that Outrunners excel in efficiency, responsiveness, and generous torque margin within the low-to-mid speed range. Directly driving multi-rotor propellers delivers smooth thrust and superior attitude control. The trade-off is lower maximum RPM and mechanical safety margins compared to Inrunners, necessitating careful thermal and stress management during sustained high-power flight.

**Typical Applications**

Multi-rotor direct drive(aerial photography drones,industrial multi-rotors,FPV racing drones,etc.)and scenarios emphasizing stable output and high efficiency.

### 2.Drone Inrunner Brushless Motor

**Structure and Principle**

The"rotor"of the Outrunner brushless motor is the outermost bell housing,with permanent magnets uniformly adhered to its inner wall.The stator consists of teeth formed by laminated silicon steel sheets,wound with three-phase copper coils,and fixed to the central shaft and base.During operation,the housing rotates together with the magnets,forming a minimal air gap between the stator and housing.The propeller is typically directly mounted to the top of the bell housing,constituting a direct-drive configuration that eliminates the need for reduction mechanisms.

**Performance Characteristics**

Easily achieves very high speeds,high power density;relatively lower torque for the same size.

Often paired with reduction gears/belts or ducted fans to drive larger loads or achieve higher propulsion efficiency.

Fixed housing,short thermal conduction path,facilitates heat dissipation design for continuous high-load operation.

**Significance for drones**

Inrunners are distinguished by high RPM, high power density, and excellent heat dissipation: they are exceptionally well-suited for fixed-wing propulsion and high-speed applications like EDF (Electric Ducted Fan). If used for multi-rotor direct drive, they generally require matching reduction gears or specialized duct/fan solutions, as their low-speed, high-torque output cannot match that of Outrunners.

**Typical Applications**

Fixed-wing(including EDF ducted fans)and other applications requiring high rotational speeds;rarely used in multi-rotor direct drive unless using reduction mechanisms or ducted fan solutions.

### 3.Why Do Drones Almost Exclusively Use Brushless Motors?

Drones place extremely high demands on thrust-to-weight ratio, endurance, responsiveness, reliability, and controllability – precisely the areas where brushless motors combined with Electronic Speed Controllers (ESCs) excel. Brushed motors fall short in efficiency, lifespan, and control precision, and have consequently been almost entirely phased out.

**Higher Efficiency&Flight Time:**Brushless motors eliminate friction and energy losses from brushes/commutators and brush sparking.This converts more electrical energy into thrust per unit of power,directly extending flight endurance.

**Higher Power Density:**They deliver greater power output for the same weight,resulting in a higher thrust-to-weight ratio.This allows the airframe to carry more sensors,batteries,or payload.

**Rapid&Precise RPM Control:**Electronic Speed Controllers(ESCs)enable high-frequency closed-loop speed regulation,providing fast and linear throttle response for significantly more stable flight control.

**Reliability&Longevity:**With no mechanical brushes to wear out,they maintain performance better under prolonged high-speed operation,enhancing safety during aerial missions.

**Lower EMI&Noise:**The absence of brush sparks reduces electromagnetic interference,ensuring more stable video transmission and radio control.Field-Oriented Control(FOC)sinusoidal driving further significantly lowers noise.

**Superior Heat Dissipation:**Windings are on the stator side,facilitating direct heat conduction to the frame.The external rotor configuration also allows airflow to cool the stator directly.

**Broad Operating Range:**Brushless motors cover diverse applications:from direct-drive large propellers at low speed/high torque(external rotor-common in multi-rotors)to high-RPM fans or geared systems(internal rotor,EDF-Electric Ducted Fan).

**Feature-Rich Ecosystem:**ESCs support functions like braking,reverse rotation,RPM telemetry,stall protection,current limiting,and thermal protection,offering convenient tuning and maintenance.

## II.Structural differences between outrunner and inrunner motors for drones

The fundamental differences between drone Outrunner and Inrunner brushless motors lie in the position of the rotating component and the arrangement of the permanent magnets and stator windings.These differences determine their torque/speed characteristics,installation methods,heat dissipation paths,and structural strength.

### 1.Position of rotating components

**Outrunner:**The rotor is integral with the motor housing(bell),and the housing rotates synchronously during operation.The stator and shaft remain fixed.The propeller is typically directly fixed to the top of the housing,enabling direct drive.

**Inrunner:**The rotor is located at the center of the motor,and the housing remains stationary.The rotor spins at high speed via bearings,outputting power through the shaft or coupling,which is then connected to the propeller or transmission mechanism.

### 2.Layout differences of magnets and coils

**Outrunner:**Permanent magnets are adhered to the inner wall of the housing,stator windings are located centrally.Due to the larger magnetic pole radius,the torque arm is longer for the same current,favoring increased low-speed torque.

**Inrunner:**Permanent magnets are mounted on the outer circumference of the rotor(or embedded).Stator windings are located on the outer side and tightly connected to the housing.The small rotor radius and high mechanical strength allow for higher safe mechanical speeds;commonly fewer pole pairs,requiring relatively lower electrical frequency,facilitating high-speed control.

### 3.Differences in torque and speed characteristics

**Outrunner:**Relatively larger rotational inertia,outputs sufficient torque at low speeds.Typically has a lower KV value,suitable for directly driving large-diameter or high-pitch propellers.

**Inrunner:**Small rotational inertia,fast acceleration response,high mechanical limit speed.Typically has a higher KV value.Torque per unit current is relatively lower,making it more suitable for high-speed loads(like EDF,small props)or driving large props via reduction mechanisms.

### 4.Differences in heat dissipation and structural stability

**Outrunner:**Main heat-generating component is the internal stator;the heat dissipation path is relatively long.The rotating housing provides some self-ventilation,beneficial for short-term high loads,but prolonged full load may cause heat accumulation,requiring enhanced ventilation and thermal management.

**Inrunner:**Stator is in direct contact with the housing,resulting in a short thermal conduction path,facilitating the addition of heat sinks,ducts,or fans;stationary housing acts as a load-bearing shell,offering better resistance to impact and foreign object intrusion.

### 5.Differences in maintenance and reliability

**Outrunner:**Intuitive structure,relatively easy disassembly;users can replace bearings and other wear parts themselves.However,the housing and magnets are more exposed,drops or collisions may cause bell deformation or magnet damage.

**Inrunner:**More compact structure,higher manufacturing and assembly precision requirements;maintenance requires specialized tools and experience.Bearings,dynamic balance,and lubrication have stricter requirements in high-speed applications.

**Structure Comparison Table:**

| Comparison Dimension | Outrunner Motor Features | Inrunner Motor Features |
| --- | --- | --- |
| Rotor Position | The rotor and the housing rotate together, with the stator fixed at the center. The magnets are fixed on the outer housing, achieving direct drive. | The rotor is at the center, and the housing remains stationary. The magnets are fixed to the inner part of the rotor. |
| Magnetic Field Distribution | Magnets are positioned on the outer housing, with the stator at the center. | The magnets are installed inside the rotor, with the stator surrounding it. |
| Rotor Speed Characteristics | The rotor speed is lower, and torque is higher, suitable for larger propellers. | The rotor speed is higher, and torque is lower, suitable for high-speed performance. |
| Thermal and Structural Stability | The outer rotor has a stable structure, but it may face heat accumulation during long-term use. | The inner rotor allows for better heat dissipation but may face mechanical strain. |
| Maintenance and Durability | Simple construction, easy to maintain, suitable for applications like multi-rotor drones and camera drones. | Stronger, more precise structure, suitable for high-speed models with higher load demands. |
| Structural and Reliability | Easy to assemble, suitable for general use with a good balance of durability and performance. | Compact and precise, suitable for professional tools and high-performance demands. |

## III.Performance Comparison of Drone Outrunner and Inrunner Motors

The performance differences between drone Outrunner and Inrunner motors are primarily determined by structural design,rotational inertia,and magnetic circuit radius.A comparison across six common dimensions is provided below.

### 1.Torque Output Comparison

**Outrunner:**Larger magnet radius,longer torque arm,produces higher torque at low speeds.More efficient when directly driving large-diameter or high-pitch propellers.Thrust adjustment is more linear in the low throttle range.

**Inrunner:**Lower torque per unit current,typically relies on higher KV and higher speeds to achieve thrust;more suitable for small-diameter,high-speed propellers,or driving large props via reduction mechanisms.

### 2.Speed Range Comparison

**Outrunner:**Limited maximum safe speed due to mechanical strength and dynamic balance constraints;but has a wide efficiency plateau in the mid-to-low speed range,offering stable output,suitable for applications requiring continuous,steady thrust.

**Inrunner:**Small rotor diameter,high mechanical strength,easily achieves very high speeds(commonly reaching and exceeding 50–60k rpm,depending on size,bearings,and dynamic balance).Suitable for high-speed propulsion or high-speed mechanical transmission scenarios(like EDF).

### 3.Size and Weight Comparison

**Outrunner:**Overall volume is usually larger and weight slightly higher to accommodate the rotating housing;but can eliminate transmission parts like gears/belts,resulting in a simpler system-level structure and lower transmission losses.

**Inrunner:**Compact structure,high power density,convenient for installation in space-constrained airframes.If a reduction mechanism is added to drive large props,the system volume and maintenance complexity increase accordingly.

### 4.Heat Dissipation Performance Comparison

**Outrunner:**Main heat source is the internal stator;the thermal conduction path is relatively long.The rotating housing provides natural ventilation,beneficial for short-term high loads,but prolonged high-power operation requires attention to temperature rise and demagnetization risk.

**Inrunner:**Stator is tightly thermally coupled to the housing,resulting in a short thermal conduction path,facilitating the addition of active or passive cooling measures like heat sinks/ducts/fans.More suitable for continuous high-load and constant-power operation.

### 5.Noise and Vibration Comparison

**Outrunner:**Often operates at lower speeds,overall acoustic sensation is softer.However,if the housing(bell)has minor eccentricity,vibration can be amplified,requiring good dynamic balance and bearing condition.

**Inrunner:**High-speed operation produces higher-frequency noise and stricter requirements for installation concentricity.High-quality bearings,precise support,and good balancing can significantly reduce vibration and noise.

### 6.Cost and Availability Comparison

**Outrunner:**Mature supply chain,complete range of models,wide price range,covering most needs from entry-level to professional.Lower acquisition and replacement costs.

**Inrunner:**Higher manufacturing and assembly tolerance requirements.Products are more focused on professional or specialized scenarios(like EDF,industrial servos).Unit and system costs are generally higher,with fewer universal models.

**Performance Comparison Table:**

| Comparison Dimension | Outrunner Motor Features | Inrunner Motor Features |
| --- | --- | --- |
| Torque Output | High torque, low rotor speed, and efficient power output. | Single-phase power supply is low, but high-speed rotation provides greater efficiency. |
| Maximum Speed Range | Maximum speed is limited, but has good efficiency at lower speeds. | Higher maximum speed, suitable for achieving higher RPM. |
| Body and Weight | Larger in size, heavier, and simple structure. | Compact design, lighter, and more complex structure. |
| Heat Performance | The motor is prone to heat accumulation over long periods, with an increased risk of overheating. | Better heat dissipation due to the inner rotor, suitable for high-speed and high-performance applications. |
| Noise and Vibration | Low noise and vibration, but prone to larger vibrations. | High-speed rotation creates higher noise and vibrations, but suitable for high-performance settings. |
| Durability and Versatility | Provides strong durability, wide range of uses, and multiple motor options. | Precision manufacturing, fewer models but better precision, suitable for industrial-grade uses. |

## IV.Applicable Scenarios in the Drone Field

Due to their different structural and performance characteristics,Outrunner and Inrunner brushless motors have distinct suitability in the drone field.Understanding their respective advantages helps in choosing the appropriate propulsion solution for different tasks.

### 1.Drone Scenarios Better Suited for Outrunner

Outrunner motors,characterized by low-speed high torque,direct propeller drive capability,simple structure,and easy maintenance,are a common choice in the drone field.With magnets on the housing and a larger rotor radius,they can output sufficient torque at lower speeds,suitable for directly driving large-diameter or multi-blade propellers without gear reduction.They are more advantageous in the following scenarios:

**Multi-rotor Direct Drive(Mainstream Application)**

Typical forms:5-inch FPV(racing/freestyle),Cinewhoop,small/medium aerial photography drones,industrial inspection and surveying drones,etc.

Reason for suitability:High demand for direct drive,low-speed high torque,and precise throttle control;Outrunner satisfies hovering and attitude control needs without transmission mechanisms.

**High-Efficiency Propulsion with Large Diameter,Low Speed**

Typical forms:Long-endurance platforms,agricultural/cargo drones,large propeller(X-class)drones,etc.

Reason for suitability:Large propellers are more efficient at low speeds;Outrunner provides stable low-speed torque and good energy-saving characteristics.

**Aerial Photography Drones and Models Requiring Precise Attitude Control**

Typical forms:7–17 inch aerial photography/cinematic drones,Cinelifter.

Reason for suitability:Higher demand for linear control in the low-speed range and resistance to wind buffeting;Outrunner more easily achieves smooth thrust adjustment.

**Projects Pursuing Structural Simplicity,Easy Maintenance,and Versatility**

Typical forms:Education/research platforms,field maintenance environments,rapidly iterating prototypes.

Reason for suitability:Rich variety of Outrunner specifications,universal installation forms,easy to replace and expand;system complexity and cost are more controllable.

### 2.Drone Scenarios Better Suited for Inrunner

Inrunner motors,characterized by high KV/high speed,compact axial dimensions,and ease of integrating heat dissipation,are better suited for the following propulsion forms and structurally constrained applications.It's important to emphasize that choosing an Inrunner depends first on the propulsion form(direct drive propeller,gear reduction,ducted fan/EDF)and space constraints,rather than a simple"high speed=Inrunner"correspondence.Outrunner remains dominant for most multi-rotor direct drive applications.

**Ducted Fan/EDF Propulsion**

Typical forms:Fixed-wing jet-like designs,ducted fan propulsion,high-speed cruise platforms with blended wing-body layouts.

Reason for suitability:EDF requires extremely high speeds to drive small-diameter impellers;Inrunner easily achieves high speeds;the motor housing facilitates integrated design with ducts and heat dissipation structures.

**High-Speed Small Diameter Propellers/Propulsion in Constrained Spaces**

Typical forms:Airframes with strict diameter constraints(e.g.,slender fuselages/wing root integration),needing to achieve target thrust with high speed+small props.

Reason for suitability:Inrunner has a slender profile,easy to embed;possesses a good efficiency window in the high-speed range.

**Engineering Solutions Using Gear Reduction to Drive Large Props**

Typical forms:Layout constraints prevent the use of Outrunner direct drive,or where gear reduction is needed to convert the Inrunner's high speed into low-speed high torque for a large propeller.

Reason for suitability:The high-speed output of the Inrunner,after reduction,can drive a more efficient large-diameter propeller while retaining the advantage of a narrow,elongated package.

**Occasions Requiring High Sealing or Integrated Heat Dissipation Housing**

Typical forms:Environments with dust,rain,fog,sea salt spray,or drones requiring the housing to directly connect to heat sinks/thermal structures.

Reason for suitability:Inrunner windings are connected to the housing,facilitating the design of heat dissipation jackets or sealed housings.

**High-Speed Platforms with Strict Aerodynamic/Form Constraints**

Typical forms:High-speed cruise platforms pursuing low-drag shapes and highly integrated internal space.

Reason for suitability:Inrunner has a smaller cross-section,helping to reduce local bulges and exposed rotating parts,improving aerodynamics and safety.

**Applicable Scenarios Table：**

| Motor Type | Typical Platforms | Selection Reason | Design Key Points | Notes |
| --- | --- | --- | --- | --- |
| Outrunner | Multi-rotor FPV (5" FPV, Cinewhoop, Aerial/Survey/Industrial) | Low speed and large size, direct drive for oil-tight and low drag | High rotor speed and low KV ratings, suitable for slow-speed flight | ESCs with 10-20% heat tolerance |
| Outrunner | Large high-speed platforms (Long-range, Agricultural, Freight) | Large low-speed platforms, low drag and low cornering | Stable flight for long ranges and lower power consumption | Precise KV and current management |
| Outrunner | Aerial/CineLifter | High efficiency, anti-wind drag | Suitable for heavy payloads and smooth wind conditions | Strong motors with higher stability |
| Inrunner | EDF (Electric Ducted Fan) | High-speed airflow, small size, easy to move | Compact and high-speed rotation suitable for precision work | ESC supports high speeds and stable cooling |
| Inrunner | Small high-speed/Restricted space | Narrow motor structure and high-speed rotation | High precision required for small, high-efficiency drones | Small high-speed motors with efficient circuits |
| Inrunner | High-end sealed/coaxial integration | Strong sealing and compact integration | High sealing performance and efficiency | Cooling system and easy temperature management |
| Inrunner | Low-profile and compact platforms | Easy to assemble, reduce size and weight | Suitable for low-profile, small drones | High-frequency performance and smoother video footage |

## V.Common Questions FAQ

**Q1:Is the lifespan difference between Outrunner and Inrunner motors significant?**

A:Under reasonable use and good maintenance,the lifespan difference is not significant.The main factors affecting lifespan are bearing wear,overheating,and physical impact.Outrunner housings are more susceptible to deformation upon impact due to rotating;Inrunners have higher demands on the high-speed stability of bearings.

**Q2:Is there a difference in wind resistance between Outrunner and Inrunner motors?**

A:Wind resistance primarily depends on the overall matching of the motor and propeller,as well as the tuning of the flight controller system;it is not solely determined by motor type.However,Outrunner motors can generally respond more directly during hovering wind resistance due to their ability to output high torque faster in the low-speed range.

**Q3:Is the difficulty of repair and parts replacement significantly different?**

A:Outrunner structure is relatively simple;replacing bearings or rewinding is easier.Inrunner structure is compact;some models require specialized tools for disassembly.Therefore,maintenance is more convenient for non-professional users with Outrunner motors.

**Q4:Is there a difference in performance between Outrunner and Inrunner motors in extremely low or high-temperature environments?**

A:In extremely low temperatures,the performance degradation is similar for both,mainly affected by bearing lubrication and motor winding materials.However,Outrunners may change temperature faster due to larger exposed surface area.In high-temperature environments,Inrunners are easier to maintain stable operation due to the ability to install heat sinks or air cooling systems.

**Q5:Which motor type has better impact resistance?**

A:Typically,Inrunner motors have better impact resistance because the housing is fixed and protects the rotor components;Outrunner housings are more susceptible to deformation upon impact due to their rotating design.However,in routine multi-rotor drone use,the difference in resistance to minor daily collisions is minimal.

**Q6:When changing motor types,do flight controller parameters need to be recalibrated?**

A:Yes.Outrunner and Inrunner motors have different response characteristics,rotational inertia,and thrust curves.After changing types,the flight controller's PID parameters and throttle curve should be recalibrated to ensure flight stability and handling feel.

Share:

We use cookies

We use our own and third-party cookies to personalize content and to analyze web traffic.