# SR6 accessory association — CommLink6 vs ours (audit)

_Generated from the CommLink6 jar (system of record). CL6 associates every accessory to its host by a **slot**: the host
provides named slots (a `HOOK` with a capacity), each accessory declares the slots it `EMBED`s into. This is exactly the
`structure.slots`/`structure.fits` model our runtime `fitsHost` already supports — the importer just doesn't populate it
from CL6, so most associations are missing or wrong (see the diff at the end)._

## Weapons (firearms)

### slot `BARREL`  (125 hosts, 11 accessories)
- **Hosts:** AK-97, Ares Alpha, Ares Arms Vigorous, Ares Crusader II, Ares Desert Strike, Ares Light Fire 70, Ares Light Fire 75, Ares M-22A1, Ares Predator VI, Ares Thunderstruck, Ares Victory, Ares Vigilant …
- **Fits:** Ares Light Fire Series Silencer, Bayonet, Bayonet, retractable, Detachable Drum Magazine, Flashlight, Low-Light, Flashlight, Thermographic, Gas-vent system, Guncam, Krime Loudener, Machine Gun Blast Shield, Silencer

### slot `TOP`  (154 hosts, 13 accessories)
- **Hosts:** AK-97, Ares Alpha, Ares Antioch II, Ares Arms Vigorous, Ares Crusader II, Ares Light Fire 70, Ares Light Fire 75, Ares M-22A1, Ares Predator VI, Ares S-III Super Squirt, Ares Thunderstruck, Ares Victory …
- **Fits:** Flashlight, Low-Light, Flashlight, Thermographic, Guncam, Imaging scope, Krime's Dual-Mode External Smartgun Link, Laser Sight (High Power), Laser Sight (Low Power), Laser Sight (Standard, German Rules only), Laser sight, Machine Gun Blast Shield, Periscope, Ranger Arms “Eagle Eye” Targeting Sensor Suite, Smartgun system

### slot `UNDER`  (91 hosts, 22 accessories)
- **Hosts:** AK-97, Ares Antioch II, Ares Arms Vigorous, Ares Desert Strike, Ares M-22A1, Ares S-III Super Squirt, Ares-GE Vanquisher, Ares-GE Vengeance, Ares-GE Vindicator, ArmTech MGL-12, Armtech MGL-24, Armtech MGL-48 …
- **Fits:** Adapter (see drones for Powered Heavy Tripod), Adapter (see drones for Reinforced Smart Firing Platform), Adapter (see drones for Smart firing platform), Adapter (see drones for Wheeled Heavy Tripod), Bayonet, Bayonet, retractable, Bipod, Detachable Drum Magazine, Flashlight, Low-Light, Flashlight, Thermographic, Guncam, Gyro mount, Krime Explosive Securing Tripod, Krime's Dual-Mode External Smartgun Link, Laser Sight (High Power), Laser Sight (Low Power), Laser Sight (Standard, German Rules only), Laser sight, Machine Gun Blast Shield, Ranger Arms “Eagle Eye” Targeting Sensor Suite, Smartgun system, Tripod

### slot `STOCK`  (73 hosts, 3 accessories)
- **Hosts:** Ares Arms Vigorous, Ares M-22A1, Ares Thunderstruck, Ares Victory, Ares Vigilant, Ares-GE Vanquisher, Ares-GE Vengeance, Ares-GE Vindicator, Barret Model 122, Behemoth, Beretta 201T, Black Wolf …
- **Fits:** Folding Stock, Hip Pad Bracing System, Shock pads

### slot `SIDE_L`  (5 hosts, 0 accessories)
- **Hosts:** Accessory Rail (left), Colt M23, Colt MS-27, Onotari Arms Kali II, Onotari Arms War Hound

### slot `SIDE_R`  (5 hosts, 0 accessories)
- **Hosts:** Accessory Rail (right), Colt M23, Colt MS-27, Onotari Arms Kali II, Onotari Arms War Hound

### slot `FIREARMS_EXTERNAL`  (0 hosts, 21 accessories)
- **Fits:** Ammo Pouch (regular), Ammo Sling, Ares Battle Buddy, Ares Gunfighter Scabbard, Armored Retention Holster, Colt Arms 24 Arm Brace, Concealable Quick Draw Holster, Concealable holster, Extended Clip, Hidden arm slide, Krime Keeper, Krime Spare Drum, Krime Tripod Replacement Pitons, Krime's Offline Support Solutions, Quick-draw holster, Regular Sling, Spare clip, Spare clip (depreciated, delete and replace), Spare clip for weapons with variable ammunition system., Speed loader, Tactical Sling

### slot `INTERNAL`  (0 hosts, 49 accessories)
- **Fits:** 1.5 km, 10 km, 14 km, 16 km, 160 km, 2 km, 20 km, 24 km, 25 km, 3, 3 km, 30 km, 32 km, 4 km, 40 km, 5 km, 7 km, 9 km, AR Interface, Airburst link, BF(4), Colt Agent Special laser sight, Crew Served (2), Crew Served (3), Crew Served (4), FA(10), Krime Escalation, Krime Junior Carbine, Pilot 3, Pilot 5, Pilot 7, Pilot 8, Ruger Lawbringer, SA(2), SS(1), SS(1-2), SS(1-3), SS(1-4), SS(1-6), Sensor 2, Sensor 5, Sensor 7, Uses 0.5 Energy per shot, Uses 1 Energy per shot, Uses 10 Energy per shot, Uses 2 Energy per shot, Uses 4 Energy per shot, Uses 5 Energy per shot, Variable ammunition system

### slot `UNDER_WEAPON_MOUNT`  (11 hosts, 14 accessories)
- **Hosts:** Ares Alpha, Easifat Ramlia A, Easifat Ramlia C, Ferrus Prime, IRM Sabretooth, Izom Artemis, Krime Ditch Combination Gun, Krime Soldier, Onotari Arms War Hound, Underbarrel Weapon Mount, Yamaha Raiden
- **Fits:** Ares Alpha, Easifat Ramlia A, Easifat Ramlia C, Grapple Gun Launcher, Grenade Launcher, Izom Artemis, Krime Ditch Combination Gun, Krime Soldier, Micro Bolo Launcher, Micro Combat Chainsaw, Onotari Arms War Hound, Shotgun, Underbarrel Carbine, Yamaha Raiden

## Weapons (melee / implant)

### slot `MELEE_EXTERNAL`  (0 hosts, 4 accessories)
- **Fits:** Concealable Sheath, Hidden Melee Arm Slide, Melee Quick-Draw Sheath, Quick-Draw Scabbard

### slot `IMPLANTWEAPON_ACCESSORY`  (0 hosts, 2 accessories)
- **Fits:** Laser sight, Silencer

### slot `INSTRUMENT_SLOT`  (7 hosts, 0 accessories)
- **Hosts:** Instrument 1 (simple), Instrument 2 (professional), Instrument 3 (rising star), Instrument 4 (big time), Instrument of death 1 (simple), Instrument of death 2(professional), Instrument of death 3 (rising star)

### slot `INSTRUMENT_WEAPON`  (3 hosts, 0 accessories)
- **Hosts:** Instrument of death 1 (simple), Instrument of death 2(professional), Instrument of death 3 (rising star)

## Armor & worn

### slot `ARMOR`  (36 hosts, 31 accessories)
- **Hosts:** Actioneer business clothes, Ares Rampart Shield Mk1, Ares Rampart Shield Mk2, Ares Rampart Shield Mk3, Ares Rampart Shield Mk4, Ares “Bug Stomper”, Armor clothing, Armor jacket, Armor vest, Armorweave cloak, Ballistic shield, Blue Collar Clothing …
- **Fits:** Ballistic Hood, Chemical Protection, Chemical Seal (needs matching helmet), Cold Resistance, Concealable ammo pouch, Densiplast Reinforcement, Drag Handle, Electricity Resistance, Electrochromic Feature, Fashion Statement, Feedback Feature, Fire Resistance, Flotation Collar, Gear Access, Gel Weave (Reactive Armor), Groin Protection Panel, Hidden Pocket, Holster, MEMS Basic Harness, Mystic Weave, ParaPlate, Personal Drone Rack, Programmable Camouflage Package, Quick Release, Reactive Armor Plates, Ruthenium Armor Concealment System, Shockweave, Thermal Dissipation, Toughweave, Trauma Response System, Water-Repellent Coating

### slot `ARMOR_MEMS`  (1 hosts, 8 accessories)
- **Hosts:** MEMS Basic Harness
- **Fits:** MEMS Ammo Pouch, MEMS Equipment Pouch, MEMS Holster, MEMS Quick-Draw Holster, MEMS Scabbard, Medkit Pouch, Shotgun Shell Ammo Holster, Tactical Sling Mount

### slot `ARMOR_REACTIVE`  (1 hosts, 2 accessories)
- **Hosts:** Ares “Bug Stomper”
- **Fits:** ParaPlate, Reactive Armor Plates

### slot `FASHION`  (0 hosts, 3 accessories)
- **Fits:** Fashion Accessory (Specialized), Fashion Accessory (Standard), Fashion Accessory (Très Chic)

### slot `HELMET_ACCESSORY`  (9 hosts, 12 accessories)
- **Hosts:** Ballistic Mask, Bowler, Fedora, Full body armor helmet, Helmet, Homburg, Mil-Spec Armor, Helmet, Silver Shield GAPS Helmet, Tribly
- **Fits:** Flare compensation, Guizhen 1 Shield Visor, Image link, Low-light vision, Single sensor, Smartlink, Subvocal microphone, Thermographic vision, Trodes, Ultrasound link, Vision enhancement, Vision magnification

## Cyberware

### slot `CYBEREYE_IMPLANT`  (5 hosts, 10 accessories)
- **Hosts:** Cybereyes, Cybereyes, Advanced Rating 6, Cybereyes, Advanced Rating 7, Ocular drone, Single Cybereye
- **Fits:** Flare compensation, Image link, Low-light vision, Ocular drone, Retinal duplication, Single sensor, Smartlink, Thermographic vision, Vision enhancement, Vision magnification

### slot `CYBEREAR_IMPLANT`  (3 hosts, 7 accessories)
- **Hosts:** Cyberears, Cyberears, Advanced Rating 6, Cyberears, Advanced Rating 7
- **Fits:** Audio enhancement, Balance Augmenter, Damper, Select sound filter, Single sensor, Soundlink, Spatial recognizer

### slot `CYBERLIMB_IMPLANT`  (10 hosts, 26 accessories)
- **Hosts:** Additional Cyberarm, Bulk Modification, Cyberarm, Cyberleg, Cybertorso, Digitigrade Legs, Drone rack, Integrated Cyberarm, Lower Body Replacement, Primitive Cyberlimb
- **Fits:** Buzzsaw, Crab claw, Embedded Holster, External Clip Port, Fangs, Flametosser, Flametosser Extra fuel capacity (+5 shots), Goring horns, Gyro mount, Heavy implanted weapon, Hydraulic jacks, Implanted Heavy Pistol, Implanted Hold-out pistol, Implanted Launcher, Implanted Light Pistol, Implanted Machine Pistol, Implanted Shotgun, Implanted Submachine Gun, Nanohive, Oral slasher, Shotgun knee, Single sensor, Smuggling compartment, Tesla coil, Wrecker, Wrist shield

### slot `HEADWARE_IMPLANT`  (1 hosts, 7 accessories)
- **Hosts:** Cyberskull
- **Fits:** Commlink, Cortex area bomb, Cortex kink bomb, Cortex microbomb, Cyberdeck, Ultrasound sensor

### slot `OPTICAL`  (14 hosts, 11 accessories)
- **Hosts:** Badge Camera, Binoculars, Camera, Contacts, Glasses, Goggles, Guncam, Imaging scope, Krime's Dual-Mode External Smartgun Link, Microcamera, Monocle, ProCam …
- **Fits:** Airburst link, Flare compensation, Guizhen 1 Shield Glasses, Image link, Low-light vision, Single sensor, Smartlink, Thermographic vision, Ultrasound link, Vision enhancement, Vision magnification

### slot `AUDIO`  (5 hosts, 4 accessories)
- **Hosts:** Directional microphone, Earbuds, Headphones, Laser microphone, Omnidirectional microphone
- **Fits:** Audio enhancement, Select sound filter, Single sensor, Spatial recognizer

### slot `GLAND`  (1 hosts, 1 accessories)
- **Hosts:** Chemical Glands
- **Fits:** Expanded Reservoir

### slot `TRANSGEN_GLAND`  (1 hosts, 1 accessories)
- **Hosts:** Transgenic chemical gland
- **Fits:** Transgenic Expanded Reservoir

### slot `NANITES`  (1 hosts, 23 accessories)
- **Hosts:** Nanohive
- **Fits:** Anti-Rad, Augmented Neural Network, Bio-Response Override, Control Rig Booster, Demolishers, Dynamic Features, Dynamic Handprints, Extracellular Reinforcement, Gastrocutter, Implant Medic, Limbic Neural Amplifier, Nanite Hunter, Nano Health Suites, Nanotattoos, Neocortical Neural Amplifier, Neural Pattern Reinforcement, Neurochemical Regulator, Neuromuscular Amplifier, Oxyrush, Savior System, Tech Blast, Tech Infestation, Toughskin

### slot `MEDKIT`  (1 hosts, 1 accessories)
- **Hosts:** Built-In Medkit
- **Fits:** Medkit

## Electronics / Matrix

### slot `COMMLINK`  (1 hosts, 10 accessories)
- **Hosts:** Commlink
- **Fits:** Agent Box Hack, Decoy Pod Hack, Erika Elite, Hermes Ikon, Meta Link, Microdeck Ranger, Persona Booster Hack, Renraku Sensei, Sony Emperor, Transys Avalon

### slot `CYBERDECK`  (1 hosts, 6 accessories)
- **Hosts:** Cyberdeck
- **Fits:** Erika MCD-6, Fairlight Excalibur, MCT 360, Renraku Kitsune, Shiawase Cyber-6, Spinrad Falcon

### slot `CORE_SLOTS`  (1 hosts, 0 accessories)
- **Hosts:** Cyberdeck Core

### slot `CYBERHACK`  (5 hosts, 1 accessories)
- **Hosts:** Breadbox Case, Briefcase, Gonzo Case, Keytar Case, RCC Case
- **Fits:** Cyberhack

### slot `CUSTOM_CYBERDECK`  (7 hosts, 0 accessories)
- **Hosts:** Breadbox Case, Briefcase, Commlink Case, Gonzo Case, Keytar Case, RCC Case, Wearable Case

### slot `CASE_MODS`  (7 hosts, 0 accessories)
- **Hosts:** Breadbox Case, Briefcase, Commlink Case, Gonzo Case, Keytar Case, RCC Case, Wearable Case

### slot `ELECTRONIC_ACCESSORY`  (40 hosts, 18 accessories)
- **Hosts:** Allegiance Control Center, Ares Red Dog Series, Aztechnology Aprendiz, Aztechnology Tlaloc, Eastern Electronics Term, Erika Elite, Erika MCD-6, Essy Motors DroneMaster, Fairlight Excalibur, Fairlight Falchion, Hermes Home Connect, Hermes Ikon …
- **Fits:** AR gloves, Armorlink Upgrade, Biometric reader, Cyberjack Boosters, Electronic paper, External Program Carrier, MapMaster sensor fob, Printer, SIM module, SIM module (hot), Satellite link, Securelink Upgrade, Simrig, Software Tag, Stealthlink Upgrade, Subvocal microphone, Trid projector, Trodes

### slot `SOFTWARE`  (50 hosts, 96 accessories)
- **Hosts:** Agent Box Hack, Allegiance Control Center, Ares Red Dog Series, Aztechnology Aprendiz, Aztechnology Tlaloc, Eastern Electronics Term, Emulator, Erika Elite, Erika MCD-6, Essy Motors DroneMaster, Fairlight Excalibur, Fairlight Falchion …
- **Fits:** Agent, Armor, Artillery Barrage, Autosoft (Knowledge: Law), Autosoft Host, Baby Monitor, Biofeedback, Biofeedback Filter, Biotech, Blackout, Blaster-Charger, Bomb Kit, Browse, Clearsight, Close Combat, Co-Pilot, Code Buddy, Comm Spoofer, Configurator, Crash and Burn, Datasoft, Decryption, Defense Pods, Defuse, Directional Shield, Door Gunner, Double Agent, Drone Master, ECM Warrior II, Edit, Electronic Warfare, Emergency Override, Emulator, Encryption, Engineering, Evasion, Exploit, Facial Scanner, File Vault, Flicker, Fork, Free Fall, Hardware, Hitchhiker, Hopper, Instruction, Junk Wall, Knowledge, Language, Lockdown, Maneuvering, Mannequin, Mapsoft, MeFeed, Mobile Medic, Nanite Pilot Program, NanoMask, Navigation, Nexus Protocol Program, Overclock, P-ICE Nope!, P-ICE Spines, P-ICE Watchdog, Performance, Personal Assistant, Pheromone Detection, Quartermaster, Reroute Signal, Rocket Launcher, Run Silent, Run Deep, Secret Agent, Shopsoft, Signal Scrubber, SimShare, Slim Jim, Smartsoft, Smoke Bomb, Sneak-Sneak, Social HUD, Special Agent, Spin Doctor, Spineshield, Stealth, Swarm, Tapeworm, Target Artist, Targeting, Team Leader, Thermal Mood Reading, Toolbox, Trace, Tracking, Tutorsoft, Virtual Machine, Vocal Tension Detection, eParkour

### slot `RCC`  (2 hosts, 10 accessories)
- **Hosts:** RCC Case, Rigger Command Console
- **Fits:** Allegiance Control Center, Ares Red Dog Series, Aztechnology Tlaloc, Essy Motors DroneMaster, Horizon Overseer, Maersk Spider, Proteus Poseidon, Scratch-build junk, Transys Eidolon, Vulcan Liegelord

### slot `SKILLJACK`  (4 hosts, 3 accessories)
- **Hosts:** Skilljack, Synthetic Skill Driver: Activesoft, Synthetic Skill Driver: Knowsoft, Synthetic Skill Driver: Linguasoft
- **Fits:** Activesoft, Knowsofts, Linguasoft

### slot `SENSOR_FUNCTION`  (2 hosts, 13 accessories)
- **Hosts:** Sensor array, Single sensor
- **Fits:** Atmosphere sensor, Camera, Cyberware scanner, Directional microphone, Geiger counter, Laser microphone, Laser range finder, MAD scanner, Matrix Signal Scanner, Motion sensor, Olfactory scanner, Omnidirectional microphone, Ultrasound

### slot `SENSOR_HOUSING`  (4 hosts, 2 accessories)
- **Hosts:** Concealable Surveillance Gear, Handheld sensor housing, Sensor Tag, Wall-mounted sensor housing
- **Fits:** Sensor array, Single sensor

### slot `PROCAM_SLOT`  (2 hosts, 0 accessories)
- **Hosts:** ProCam, ProCam with internal SmartCam

## Vehicles / drones

### slot `VEHICLE_CF`  (22 hosts, 4 accessories)
- **Hosts:** Extra-Small Trailer, Extra-Small Trailer (open), GMC Grizzly, Increase Cargo Space, Krime Dix Prime Mover, Large Trailer, Large Trailer (open), Medium Trailer, Medium Trailer (open), Reduce Cargo Space, Reduce Seating, Renraku Pelican 2 Delivery Drone …
- **Fits:** Increase Seating, Metahuman adjustments, Reduce Seating, Smuggling Compartment

### slot `VEHICLE_CHASSIS`  (8 hosts, 43 accessories)
- **Hosts:** Krime Euskaldunak Tankette, Krime Prowler, Reduce Cargo Space, Removed Manual Controls, Roller-Bombs, Stripping, Zodiac Whisper, Zodiac Whisper Military
- **Fits:** Airframe Ceramic Plate, Amenities, Armor (Ceramic), Armor (Standard), Easy Assembly/Disassembly, Easy Assembly/Disassembly (Microdrones), Ejection Seat, Electromagnetic Shielding, Elemental Hardening, Expanded Ammo Bins, Expanded Drone Storage, Extra Entry/Exit Points, Extreme Environmental Mods, Extreme Interior Security - Gas, Extreme Interior Security - Zapper, GMC Forge, Grey Mana Integration, Gun Port, Hardpoint Huge, Hardpoint Large, Hardpoint Small, Hardpoint Standard, Heavy Mil-Spec Plate, Improved Handling, Increase Cargo Space, Increased Structural Integrity, Integrated Cyberarm, Life Safety System, MedEvac, Mil-Spec Frame, Mil-Spec Hardpoint, Milspec Plate, Multi-Terrain Suspension (Active), Multi-Terrain Suspension (Static), Passenger Protection Systems (PPS), Pilot-by-Wire, Pop-Out Concealment, Powered Breakdown, RAM Plating, Realistic Features, Reduce Cargo Space, Removed Manual Controls, Renraku Kitsune

### slot `VEHICLE_ELECTRONICS`  (3 hosts, 20 accessories)
- **Hosts:** Krime Euskaldunak Tankette, Zodiac Whisper, Zodiac Whisper Military
- **Fits:** Anti-theft system, Ares Gunrunner GR-02, Chameleon Coating, Command and Control Comms (C3), Electrochromic Paint, Electronic Control Lockout, Electronic Countermeasures (ECM), Enhanced Sensors, Improved Pilot, Integrated Matrix Device Dock, Nanomaintenance Repair System, Network Sharing Enhancement, Passive Stealth Features, ProCam, ProCam with internal SmartCam, Retrans Unit, Suncell, Zapper, x Guide Override

### slot `VEHICLE_HARDPOINT`  (15 hosts, 29 accessories)
- **Hosts:** Cyberspace Designs Quadrotor, Easily Modified, Hardpoint Huge, Hardpoint Large, Hardpoint Small, Hardpoint Standard, MCT-Nissan Roto-Drone, Mil-Spec Hardpoint, Powered Heavy Tripod, Reinforced Smart Firing Platform, Roller-Bombs, Smart firing platform …
- **Fits:** Ascalon Rail Gun Turret, Aztech Centipede, Blow-Away Panels, Crossbow for Quadrotor, Cyberspace Designs Dragonfly-Alpha, Drone rack, Krime Ripper, Launcher, MCT Hornet, Marine Technologies Sea Snake, Mechanical Arm, Mil-Spec Weapon Mount, Nissan Spurs, Pop-Out Concealment, Proteus Krake, Push Bar, Ram Plate, Renraku Kitsune, Tool Storage Compartment, Vulcan-Krupp Hollenfaust, Weapon mount-Heavy, Weapon mount-Small, Weapon mount-Standard, Weapon mount-Turret-Heavy, Weapon mount-Turret-Small, Weapon mount-Turret-Standard, Whispering Death, Winch with Hook

### slot `VEHICLE_POWERTRAIN`  (3 hosts, 13 accessories)
- **Hosts:** Krime Euskaldunak Tankette, Krime Prowler, Roller-Bombs
- **Fits:** Gecko Tips, GridLink, Hydrocarbon Fuel Converter, Improved Acceleration, Improved Economy/Capacity, Improved Stability, Mitsuhama Akiyama, Nitro Boost, Racing Suspension, Secondary Propulsion Systems, Suncell, Top Speed Increase, Tuned Suspension

### slot `VEHICLE_TIRES`  (4 hosts, 1 accessories)
- **Hosts:** Roller-Bombs, Vulcan Systems Opossum Mk I, Vulcan Systems Opossum Mk II, Vulcan Systems Utility-One
- **Fits:** Speciality Tires

### slot `VEHICLE_WEAPON`  (3 hosts, 0 accessories)
- **Hosts:** Weapon mount-Standard, Weapon mount-Turret-Small, Weapon mount-Turret-Standard

### slot `VEHICLE_WEAPON_SMALL`  (2 hosts, 0 accessories)
- **Hosts:** Nissan Samurai, Weapon mount-Small

### slot `VEHICLE_WEAPON_LARGE`  (3 hosts, 2 accessories)
- **Hosts:** Krime Calliope, Weapon mount-Heavy, Weapon mount-Turret-Heavy
- **Fits:** Krime Calliope, Krime Carpet

### slot `VEHICLE_WEAPON_MILITARY`  (1 hosts, 0 accessories)
- **Hosts:** Mil-Spec Weapon Mount

### slot `VEHICLE_ACCESSORY`  (1 hosts, 9 accessories)
- **Hosts:** Roller-Bombs
- **Fits:** Distinctive Features, Emergency Light Bars/Siren, Gas Dispersal System, Krime Calliope, Oil Slick Sprayer, Road Strip Ejector, Searchlight, Smoke Projector, Spoof Kit

---

## Diff vs ours (root cause)

Our catalog derives "what fits what" two ways, **neither of which models CL6's slot system** for most hosts:

1. **Book-table columns** (`importer/sr6/catalog.py`: `MOUNT` → `mount`, `MOD SLOTS` → `slots`, `HARDPOINT`). This
   captures *weapon mounts* and *vehicle mod slots* (which the books print as columns), but **not** cyberware
   eye/ear/limb/headware, armor, commlink/cyberdeck or electronics associations — the books don't print those as a
   "fits" column; CL6 encodes them as `EMBEDDED slot`/`HOOK` which the PDF import never sees.
2. **Category-title parsing** (`importer/sr6/categories.py`, runtime `categories.ts` `hostsOf`/`fitsHost`): `"Cyberlimb
   accessory" fits Cyberlimb`. Only works when a tidy "X accessory" category title exists.

**Consequences observed in testing:**
- **Cyberears** offered *none* of its real enhancements (Audio enhancement, Select sound filter, Spatial recognizer,
  Balance Augmenter, Damper, Soundlink, Antennae, Increased Spectrum Hearing, Orientation System, Perfect Pitch,
  Translation Ear, Vestibular Stabilizer, Rolling Audio Recorder, Single Sensor, Anti-Tamper) — the `CYBEREAR_IMPLANT`
  slot is never matched.
- **Cybereyes** offered a few right items but missed most (Image Link, Flare Compensation, Low-Light/Thermographic
  Vision, Vision Enhancement/Magnification, Smartlink, Microscopic Lenses, Retinal Duplication, Eye-Light System,
  Rolling Video Recorder, Spider Eyes, Single Sensor, Ocular Drone, Anti-Tamper).
- **Leak**: weapon accessories (FN P93 Flashlight, Folding Stock, Variable ammunition system) and armor accessories
  (Water-Repellent Coating) appeared on **cyberware** pickers. Cause: `Augmentations.tsx` passes `filter: isAccessory`,
  and the picker's fallback offers `!categoryOf(e) && isAccessory(e)` — **host-agnostic**: any category-less accessory
  is offered to any augmentation.

## Fix (two parts)

1. **Picker Part-B leak** (`src/sr6/runner-builder/ui/Picker.tsx`): make the category-less fallback host-aware so a
   weapon/armor accessory with no category record can't be offered to a cyberware host.
2. **Association model** (`importer/sr6/**` + catalog): apply CL6's authoritative slot map as catalog fit-data — emit
   host `<slot id value>` (from CL6 `HOOK`) and accessory `<fits slot>` (from CL6 `EMBEDDED slot`), matched CL6→our
   ids. Then `fitsHost`'s slot branch offers exactly the CL6-valid set, for **every** equipment type above. This is the
   CL6 override the owner authorized. Gated by the CL6 replay/accuracy gates + a reimport.
