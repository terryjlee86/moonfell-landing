# System Definitions

## Scene

A scene is a specific scenario that isn't when the player is traveling or resting. It occurs when the player is directly interacting with the Narrator in a turn-based manner. Scenes are akin to action scenarios in the game, triggered and populated from other scenarios like traveling or resting. Within a scene, events unfold formulaically, following a turn order (to be defined), and have a beginning and an end. Use cases within a scene include combat, discussion, puzzles, etc. The resolution of a scene is achieved either by player choice or by meeting certain criteria.

## Travel

Travel is a type of scenario in which the player is travelling through the world, travel requires certain user choices such as mode of travel, speed of travel, location or direction, type of travel. These all feed into the travel system which will calculate speed and distance traveled. The speed and distance have an impact on supplied used in travel. Travel also has the opporunity to be interupted by a scene triggering. The type of scene is determined by a travel encounter manager and will be driven in part by the players travel choices

## Rest

Rest is a type of scenario in which the player is resting either out of need as per survival or to regain vitals. Rest requires certain user choices such as place of rest, camp quality, watch pattern, defences or alarms. These all feed into the rest system which will calculate qaulity and time to full recovery. Rest also has the opporunity to be interupted by a scene triggering. The type of scene is determined by a rest encounter manager and will be driven in part by the players choices in the rest choices


## Survival 

Survival is the term we refernce when we talk about the players vitals and foot and rest requirements. In gameplay the players fatigue counter will go up and the food and water counters will go down. When either reach a certain point, negative effects start happening which will be defined later. Those negative effects will eventially lead to vitality loss which is the players health. Different modifers will influence the speed at which all of these counters change, for the psoitive and negative. ACtions such as resting or eating will increase or decrease specific conters
