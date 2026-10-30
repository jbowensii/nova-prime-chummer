// Made-up vehicle design parts and vehicle mods for the Designer's tests (engine and UI): invented names and numbers.
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'

export const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="150"'
export const DESIGN_PARTS = `<sr6:data ${NS} kind="vehicledesign" version="1">
  <design id="zz.zip-frame" ${at} category="chassis type" body="10" armor="4" handling="3" seats="4" bp="7" sizeClass="6"><name>Zip Frame</name></design>
  <design id="zz.lug-frame" ${at} category="chassis type" body="14" armor="12" handling="4" seats="2" bp="8" sizeClass="7" special="Extra cargo (+4 CF)"><name>Lug Frame</name></design>
  <design id="zz.gnat" ${at} category="chassis type" body="2" armor="1" handling="3" seats="0" bp="8" sizeClass="2"><name>Gnat Drone, Small</name></design>
  <design id="zz.roller" ${at} category="powertrain type" accel="15" interval="20" topSpeed="250" bp="10"><name>Roller</name></design>
  <design id="zz.stomper" ${at} category="powertrain type" accel="10" interval="15" topSpeed="30" bp="15" special="No Top Speed loss for Body &amp; Armor"><name>Stomper</name></design>
  <design id="zz.floater" ${at} category="powertrain type" accel="15" interval="45" topSpeed="120" bp="12" special="-2 handling"><name>Floater</name></design>
  <design id="zz.flapper" ${at} category="powertrain type" accel="15" interval="25" topSpeed="300" bp="50"><name>Flapper (Air)</name></design>
  <design id="zz.brainbox" ${at} category="console type" pilot="2" sensor="2" bp="5" special="12"><name>Brainbox</name></design>
  <design id="zz.size-2" ${at} category="size class" cargo="5 kg"><name>Size Class 2</name></design>
  <design id="zz.size-6" ${at} category="size class" cargo="1 CF"><name>Size Class 6</name></design>
  <design id="zz.size-7" ${at} category="size class" cargo="4 CF"><name>Size Class 7</name></design>
  <design id="zz.improved-body" source="ZZ" page="151" category="Options" dp="4" perLevel="true" max="4"><name>Improved Body</name></design>
  <design id="zz.improved-armor" source="ZZ" page="151" category="Options" dp="2" perLevel="true" max="2 x Body"><name>Improved Armor</name></design>
  <design id="zz.improved-handling" source="ZZ" page="151" category="Options" dp="5" perLevel="true" max="3"><name>Improved Handling</name></design>
  <design id="zz.improved-seating" source="ZZ" page="151" category="Options" dp="2" perLevel="true" max="50% x Seat"><name>Improved Seating</name></design>
  <design id="zz.improved-size" source="ZZ" page="151" category="Options" dp="4" perLevel="true" max="Size Class 20" maxReverse="2"><name>Improved Size</name></design>
  <design id="zz.improved-speed-interval" source="ZZ" page="151" category="Options" dp="5" perLevel="true" max="3"><name>Improved Speed Interval</name></design>
  <design id="zz.improved-cargo-space" source="ZZ" page="151" category="Options" dp="2" perLevel="true" max="min(3, 2 x CF)"><name>Improved Cargo Space</name></design>
  <design id="zz.easily-modified" source="ZZ" page="151" category="Options" dp="4" perLevel="true" max="min(4, Body)"><name>Easily Modified</name></design>
  <design id="zz.racing" source="ZZ" page="152" category="Modifications" dp="+25"><name>Racing</name></design>
  <design id="zz.integrated-armor" source="ZZ" page="152" category="Modifications" dp="20"><name>Integrated Armor</name></design>
  <design id="zz.multi-engine" source="ZZ" page="153" category="Modifications" dp="25"><name>Multi-Engine</name></design>
  <design id="zz.underpowered" source="ZZ" page="153" category="Modifications" dp="-20"><name>Underpowered</name></design>
  <design id="zz.one-off" source="ZZ" page="153" category="Quality Factors" multiplier="x2"><name>One-off Custom</name></design>
  <design id="zz.drone" source="ZZ" page="153" category="Quality Factors" multiplier="x0.5"><name>Drone</name></design>
  <design id="zz.luxury" source="ZZ" page="154" category="Quality Factors" multiplier="x1.5"><name>Luxury</name></design>
  <design id="zz.military" source="ZZ" page="154" category="Quality Factors" multiplier="x3"><name>Military</name></design>
</sr6:data>`
export const DESIGN_GEAR = `<sr6:data ${NS} kind="gear" version="1">
  <gear id="zz.zap-grip" ${at} category="Chassis mod" class="MOD_CHASSIS/MOD_HANDLING" slots="2" avail="4" cost="1000"><name>Zap Grip</name></gear>
  <gear id="zz.zip-mount" ${at} category="Weapon mount" class="MOD_HARD/MOD_MOUNT" hardpoint="standard" slots="1" avail="4(I)" cost="1500"><name>Zip Weapon Mount</name></gear>
  <gear id="zz.powertrain-roller" ${at} category="Vehicle modification" class="MOD_POWER/MOD_PROPULSION" modonly="true" cost="0"><name>Roller Powertrain</name><fits slot="vehicle-powertrain"/></gear>
  <gear id="zz.powertrain-floater" ${at} category="Vehicle modification" class="MOD_POWER/MOD_PROPULSION" modonly="true" cost="0"><name>Floater Powertrain</name><fits slot="vehicle-powertrain"/></gear>
  <gear id="zz.glitter-paint" ${at} category="Chassis mod" class="MOD_CHASSIS/MOD_SKIN" slots="0" avail="6(L)" cost="4000"><name>Glitter Paint</name></gear>
</sr6:data>`
// a made-up catalog vehicle, for the "start from a known vehicle" path
export const DESIGN_VEHICLE = `<sr6:data ${NS} kind="vehicles" version="1">
  <vehicle id="zz.grizzly" source="ZZ" page="200" category="Truck" body="12" armor="10" handling="4/3" accel="7" interval="20" topSpeed="90" pilot="3" sensor="3" seats="6" avail="6" cost="40000"><name>Custom Grizzly</name><part id="pp" ref="zz.powertrain-roller" hook="vehicle-powertrain" cost="4" origin="synth" removable="true"/></vehicle>
</sr6:data>`
/** The fixture catalog with the made-up design parts and mods. */
export const designCatalog = () =>
  fixtureCatalog(undefined, [
    { file: 'custom/sr6/imported/zz/vehicledesign.xml', xml: DESIGN_PARTS },
    { file: 'custom/sr6/imported/zz/gear.xml', xml: DESIGN_GEAR },
    { file: 'custom/sr6/imported/zz/vehicles.xml', xml: DESIGN_VEHICLE },
  ])
export const designWorld = () => ({ data: sr6Data(designCatalog()), cr: fixtureCreation() })
