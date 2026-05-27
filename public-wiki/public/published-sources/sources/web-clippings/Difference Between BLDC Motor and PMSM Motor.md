---
title: "Difference Between BLDC Motor and PMSM Motor"
source: "https://www.geeksforgeeks.org/electrical-engineering/difference-between-bldc-motor-and-pmsm-motor/"
author:
  - "[[GeeksforGeeks]]"
published: 2024-02-23
created: 2026-04-11
description: "Your All-in-One Learning Portal: GeeksforGeeks is a comprehensive educational platform that empowers learners across domains-spanning computer science and programming, school education, upskilling, commerce, software tools, competitive exams, and more."
tags:
  - "clippings"
---
BLDC Motor and PMSM Motor are widely used in modern electrical and electronic systems. These motors convert electrical energy into mechanical energy, but the way they operate and the type of current they use is different. When we talk about brushless motors in automobiles, robotics, appliances, etc., BLDC and PMSM are the two most commonly discussed motors.

## What is a BLDC Motor?

BLDC stands for ****Brushless Direct Current Motor****. As the name suggests, it runs on ****DC supply**** and does not use brushes or commutators. Instead, BLDC motors use an ****electronic commutation circuit**** to control the current in the windings.Construction of BLDC Motor

Here is the circuit diagram of BLDC Motor.

![BLDC Motor](https://media.geeksforgeeks.org/wp-content/uploads/20240221134632/BLDC-Motor.png)

BLDC Motor

A BLDC motor mainly consists of:

- ****Stator:**** Stationary part with windings
- ****Rotor:**** Rotating part containing permanent magnets
- ****Electronic Controller:**** Replaces the traditional brush and commutator system
- ****DC Power Supply****

The controller energizes the stator windings in a specific sequence. The rotor magnets align with the magnetic field, causing rotation.

### Operation of BLDC Motor

1. When DC supply is given, the ****stator windings are energized****.
2. A ****magnetic field**** is produced in the stator.
3. Permanent magnets in the rotor get attracted/repelled by this field.
4. The controller continuously switches windings, creating a ****rotating magnetic field****.
5. The rotor follows this rotating field, producing mechanical rotation.

Thus, the motor converts ****electrical energy → mechanical energy**** efficiently using electronic commutation.

## What is a PMSM Motor?

PMSM stands for Permanent Magnet Synchronous Motor. It is an AC synchronous motor that uses permanent magnets in the rotor. Unlike BLDC motors, PMSM runs on AC supply and rotates at a fixed synchronous speed.

### Construction of PMSM Motor

Here is the circuit diagram of PMSM Motor

![PMSM motor](https://media.geeksforgeeks.org/wp-content/uploads/20240221133153/vfw.webp)

PMSM motor

A PMSM motor consists of:

- ****Stator:**** With 3-phase AC windings
- ****Rotor:**** Permanent magnets mounted on or inside the rotor
- ****AC Power Source / Inverter****
- ****Control Circuit****

The stator creates a rotating magnetic field when AC supply is applied.

### Operation of PMSM Motor

1. When AC power is supplied, the stator creates a ****rotating magnetic field (RMF)****.
2. The permanent magnets in the rotor align with this rotating field.
3. The rotor rotates ****exactly at synchronous speed****.
4. Continuous rotation is maintained as the AC supply keeps changing direction.

This motor is ****not self-starting**** and usually requires an inverter drive.

## Difference Between BLDC Motor and PMSM Motor

Let us compare BLDC Motor and PMSM Motor

| ****Parameter**** | ****BLDC Motor**** | ****PMSM Motor**** |
| --- | --- | --- |
| ****Full Form**** | Brushless Direct Current Motor | Permanent Magnet Synchronous Motor |
| ****Type**** | DC Motor | AC Synchronous Motor |
| ****Working**** | Electronic commutation controls winding switching | Runs at synchronous speed using AC rotating magnetic field |
| ****Torque**** | Lower torque | Higher torque |
| ****Efficiency**** | 85%–90% | 92%–97% |
| ****Losses**** | Higher core losses due to harmonics | Lower harmonic losses |
| ****Torque Ripple**** | Present | Almost absent |
| ****Control Technique**** | Simple | Complex (vector control/FOC) |
| ****Cost**** | Less expensive | More expensive |
| ****Applications**** | Home appliances, fans, drives, robotics | EVs, industrial automation, aerospace |

### Advantages of BLDC Motor

- No brushes → ****no sparking****, safer operation
- ****Higher efficiency**** than traditional DC motors
- ****Fast response****, wide speed control range
- ****Low maintenance****
- Compact and reliable

### Advantages of PMSM Motor

- ****Very high efficiency****
- High power density (more torque in smaller size)
- No rotor current → less heating
- Excellent performance for ****heavy loads****
- Ideal for robotics, EVs, precision systems

### BLDC Motor Disadvantages

- Requires an ****electronic controller****, increasing cost
- Permanent magnets limit operating temperature
- High initial setup cost

### PMSM Motor Disadvantages

- Permanent magnets can lose magnetism at high temperatures
- Complex control techniques
- More expensive than BLDC
- Needs inverter/drive for operation

### Applications of BLDC Motor

- Washing machines
- CD/DVD drives, hard drives
- Fans, pumps
- Robotics
- Small electric vehicles
- Industrial automation

### Applications of PMSM Motor

- Electric vehicles (EVs)
- Servo drives
- Aerospace systems
- Machine tools
- Power factor correction
- Robotics and automation
- High-performance industrial machines