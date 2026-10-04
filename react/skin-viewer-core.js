(() => {
  const VIEWER_CAMERA_FOV = 36;
  const craftTextureCache = new Map();
  const CHARM_GLB_DEFAULT = "assets/models/keychains/kc_db_biomech/charm.gltf?v=20260911-bombastic-1";
  const SLAB_GLB_DEFAULT = "assets/models/keychains/kc_sticker_display_case/charm.gltf?v=20260808-guns-charm-1";
  // Shared CS2 weapon-keychain clasp (kc_wpn_chain) — replaces the procedural torus pin.
  const CHARM_PIN_GLTF = "assets/models/keychains/kc_pin/charm.gltf?v=20260812-pin-tex-1";
  const CHARM_BODY_MATERIAL_RE = /eco|body|charm|pendant|biomech|missinglink|kc_db_|kc_wpn_|kc_missinglink|sticker_display_case(?!_clip)/;
  const CHARM_HARDWARE_MATERIAL_RE = /(?:^|_)(?:chain|clip|clasp|carabiner|hardware|attach)(?:_|$)|kc_db_chain|sticker_display_case_clip|missinglink_chain|missinglink.*(?:chain|clip|ring|band|attach)|_chain/;
  const CHARM_HARDWARE_MESH_RE = /(?:^|_|\/)(?:chain|clip|clasp|carabiner|hardware|attach|ring)(?:_|$|\.)|sticker_display_case_clip|missinglink_chain|missinglink.*(?:chain|clip|ring|band)/;
  const SLAB_FACE_LOCAL = {
    // Measured from CS2 kc_sticker_display_case UV1 face verts (model space).
    center: [0, 0.10316, -1.53251],
    size: [1.62, 1.62],
    normal: [0, 1, 0],
  };
  let charmGltfTemplatePromise = null;
  let charmGltfTemplate = null;
  let charmGltfFittedTemplate = null;
  let charmGltfLoadedUrl = "";
  let charmGltfLoadingUrl = "";
  let charmPinTemplatePromise = null;
  let charmPinFittedTemplate = null;

  const LOCAL_MODEL_MATCHERS = [
    { matches: ["m249 | aztec"], url: "assets/models/skins/m249_aztec.glb?v=20260915-crafter-import-1" },
    { matches: ["m249 | blocks purple"], url: "assets/models/skins/m249_blocks_purple.glb?v=20260915-crafter-import-1" },
    { matches: ["m249 | combine"], url: "assets/models/skins/m249_combine.glb?v=20260915-crafter-import-1" },
    { matches: ["m249 | deep relief"], url: "assets/models/skins/m249_deep_relief.glb?v=20260915-crafter-import-1" },
    { matches: ["m249 | downvote"], url: "assets/models/skins/m249_downvote.glb?v=20260915-crafter-import-1" },
    { matches: ["m249 | hypnosis"], url: "assets/models/skins/m249_hypnosis.glb?v=20260915-crafter-import-1" },
    { matches: ["m249 | nebula crusader"], url: "assets/models/skins/m249_nebula_crusader.glb?v=20260915-crafter-import-1" },
    { matches: ["m249 | scarab"], url: "assets/models/skins/m249_scarab.glb?v=20260915-crafter-import-1" },
    { matches: ["m249 | sektor"], url: "assets/models/skins/m249_sektor.glb?v=20260915-crafter-import-1" },
    { matches: ["m249 | spectre"], url: "assets/models/skins/m249_spectre.glb?v=20260915-crafter-import-1" },
    { matches: ["m249 | warbird veteran"], url: "assets/models/skins/m249_warbird_veteran.glb?v=20260915-crafter-import-1" },
    { matches: ["mp7 | commander"], url: "assets/models/skins/mp7_commander.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | latte color"], url: "assets/models/skins/mp9_latte_color.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | black sand"], url: "assets/models/skins/mp9_black_sand.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | chevron"], url: "assets/models/skins/mp9_chevron.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | colony01"], url: "assets/models/skins/mp9_colony01.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | deadly poison"], url: "assets/models/skins/mp9_deadly_poison.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | dune asp"], url: "assets/models/skins/mp9_dune_asp.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | food chain"], url: "assets/models/skins/mp9_food_chain.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | hydra"], url: "assets/models/skins/mp9_hydra.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | island floral"], url: "assets/models/skins/mp9_island_floral.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | narcis"], url: "assets/models/skins/mp9_narcis.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | nexus"], url: "assets/models/skins/mp9_nexus.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | prototype extended"], url: "assets/models/skins/mp9_prototype_extended.glb?v=20260915-crafter-import-1" },
    { matches: ["negev | bratatat"], url: "assets/models/skins/negev_bratatat.glb?v=20260915-crafter-import-1" },
    { matches: ["negev | overpass graf"], url: "assets/models/skins/negev_overpass_graf.glb?v=20260915-crafter-import-1" },
    { matches: ["negev | titanstorm"], url: "assets/models/skins/negev_titanstorm.glb?v=20260915-crafter-import-1" },
    { matches: ["negev | annihilator"], url: "assets/models/skins/negev_annihilator.glb?v=20260915-crafter-import-1" },
    { matches: ["negev | thor"], url: "assets/models/skins/negev_thor.glb?v=20260915-crafter-import-1" },
    { matches: ["negev | ultralight"], url: "assets/models/skins/negev_ultralight.glb?v=20260915-crafter-import-1" },
    { matches: ["nova | overpass wurst"], url: "assets/models/skins/nova_overpass_wurst.glb?v=20260915-crafter-import-1" },
    { matches: ["nova | drakkar"], url: "assets/models/skins/nova_drakkar.glb?v=20260915-crafter-import-1" },
    { matches: ["nova | featherswing"], url: "assets/models/skins/nova_featherswing.glb?v=20260915-crafter-import-1" },
    { matches: ["nova | hunter brute"], url: "assets/models/skins/nova_hunter_brute.glb?v=20260915-crafter-import-1" },
    { matches: ["nova | hyperbeast"], url: "assets/models/skins/nova_hyperbeast.glb?v=20260915-crafter-import-1" },
    { matches: ["nova | koi"], url: "assets/models/skins/nova_koi.glb?v=20260915-crafter-import-1" },
    { matches: ["nova | ocular adjusted"], url: "assets/models/skins/nova_ocular_adjusted.glb?v=20260915-crafter-import-1" },
    { matches: ["nova | polymer"], url: "assets/models/skins/nova_polymer.glb?v=20260915-crafter-import-1" },
    { matches: ["nova | ranger"], url: "assets/models/skins/nova_ranger.glb?v=20260915-crafter-import-1" },
    { matches: ["nova | rising sun"], url: "assets/models/skins/nova_rising_sun.glb?v=20260915-crafter-import-1" },
    { matches: ["nova | sobek"], url: "assets/models/skins/nova_sobek.glb?v=20260915-crafter-import-1" },
    { matches: ["nova | toysoldier"], url: "assets/models/skins/nova_toysoldier.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | anubis"], url: "assets/models/skins/ak47_anubis.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | asiimov"], url: "assets/models/skins/ak47_asiimov.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | autoexec camo"], url: "assets/models/skins/ak47_autoexec_camo.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | aztec"], url: "assets/models/skins/ak47_aztec.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | bloodsport"], url: "assets/models/skins/ak47_bloodsport.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | cogthings"], url: "assets/models/skins/ak47_cogthings.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | crane flight color"], url: "assets/models/skins/ak47_crane_flight_color.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | empress"], url: "assets/models/skins/ak47_empress.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | explosive"], url: "assets/models/skins/ak47_explosive.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | jinn consequence"], url: "assets/models/skins/ak47_jinn_consequence.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | mastery"], url: "assets/models/skins/ak47_mastery.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | nibbler"], url: "assets/models/skins/ak47_nibbler.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | nightwish"], url: "assets/models/skins/ak47_nightwish.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | purple gradient"], url: "assets/models/skins/ak47_purple_gradient.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | strone"], url: "assets/models/skins/ak47_strone.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | supercharged"], url: "assets/models/skins/ak47_supercharged.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | t-bus"], url: "assets/models/skins/ak47_t_bus.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | winter sport"], url: "assets/models/skins/ak47_winter_sport.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | anarchy"], url: "assets/models/skins/ak47_anarchy.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | graphic overlay"], url: "assets/models/skins/ak47_graphic_overlay.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | jaguar"], url: "assets/models/skins/ak47_jaguar.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | panther"], url: "assets/models/skins/ak47_panther.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | rubber"], url: "assets/models/skins/ak47_rubber.glb?v=20260915-crafter-import-1" },
    { matches: ["ak-47 | tribute"], url: "assets/models/skins/ak47_tribute.glb?v=20260915-crafter-import-1" },
    { matches: ["desert eagle | overpass aqua"], url: "assets/models/skins/deagle_overpass_aqua.glb?v=20260915-crafter-import-1" },
    { matches: ["desert eagle | aggressor"], url: "assets/models/skins/deagle_aggressor.glb?v=20260915-crafter-import-1" },
    { matches: ["desert eagle | calligraff"], url: "assets/models/skins/deagle_calligraff.glb?v=20260915-crafter-import-1" },
    { matches: ["desert eagle | eastern enigma blue"], url: "assets/models/skins/deagle_eastern_enigma_blue.glb?v=20260915-crafter-import-1" },
    { matches: ["desert eagle | firebreathing"], url: "assets/models/skins/deagle_firebreathing.glb?v=20260915-crafter-import-1" },
    { matches: ["desert eagle | kitch"], url: "assets/models/skins/deagle_kitch.glb?v=20260915-crafter-import-1" },
    { matches: ["desert eagle | mecha"], url: "assets/models/skins/deagle_mecha.glb?v=20260915-crafter-import-1" },
    { matches: ["desert eagle | naga"], url: "assets/models/skins/deagle_naga.glb?v=20260915-crafter-import-1" },
    { matches: ["desert eagle | replica"], url: "assets/models/skins/deagle_replica.glb?v=20260915-crafter-import-1" },
    { matches: ["desert eagle | pilot"], url: "assets/models/skins/deagle_pilot.glb?v=20260915-crafter-import-1" },
    { matches: ["mp7 | constellation dark"], url: "assets/models/skins/mp7_constellation_dark.glb?v=20260915-crafter-import-1" },
    { matches: ["mp7 | commander"], url: "assets/models/skins/mp7_commander.glb?v=20260915-crafter-import-1" },
    { matches: ["mp7 | replica"], url: "assets/models/skins/mp7_replica.glb?v=20260915-crafter-import-1" },
    { matches: ["mp7 | nemesis"], url: "assets/models/skins/mp7_nemesis.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | arctic"], url: "assets/models/skins/mp9_arctic.glb?v=20260915-crafter-import-1" },
    { matches: ["mp9 | fuji"], url: "assets/models/skins/mp9_fuji.glb?v=20260915-crafter-import-1" },
    { matches: ["p250 | coridium contour blue"], url: "assets/models/skins/p250_coridium_contour_blue.glb?v=20260915-crafter-import-1" },
    { matches: ["p250 | inferno"], url: "assets/models/skins/p250_inferno.glb?v=20260915-crafter-import-1" },
    { matches: ["p250 | verdigris"], url: "assets/models/skins/p250_verdigris.glb?v=20260915-crafter-import-1" },
    { matches: ["usp-s | torque", "usp-s | progressive", "usp-s | progresive", "usp-s | progressiv"], url: "assets/models/weapons/usp_s_progresive/usp_progresive.glb?v=20260911-usp-3d-1" },
    { matches: ["ak-47 | point disarray"], url: "assets/models/akk.glb?v=20260808-normal-alpha-1" },
    { matches: ["ak-47 | cartel"], url: "assets/models/cartel.glb?v=20260808-normal-alpha-1" },
    { matches: ["m4a1-s | vaporwave"], url: "assets/models/m4blendmodel.glb?v=20260808-normal-alpha-1" },
    { matches: ["m4a1-s | quick liquidation"], url: "assets/models/m4blendmodeLiquidationl.glb?v=20260808-normal-alpha-1" },
    { matches: ["aug | torque"], url: "assets/models/crafter/aug.glb?v=20260808-normal-alpha-1" },
    { matches: ["awp | ice coaled"], url: "assets/models/crafter/awp.glb?v=20260808-normal-alpha-1" },
    { matches: ["famas | roll cage"], url: "assets/models/crafter/famas.glb?v=20260808-normal-alpha-1" },
        { matches: ["glock-18 | wasteland rebel"], url: "assets/models/wasteland_rebel.glb?v=20260827-glock-rear-1" },
{ matches: ["mac-10 | saibā oni", "mac-10 | saiba oni"], url: "assets/models/crafter/mac.glb?v=20260808-normal-alpha-1" },
    { matches: ["mp7 | bloodsport"], url: "assets/models/mp7_bloodsport.glb?v=20260812-mp7-bloodsport-1" },
    { matches: ["ump-45 | neo-noir"], url: "assets/models/ump45_neo_noir.glb?v=20260812-ump-neo-1" },
    { matches: ["negev | dev_texture", "negev | dev texture"], url: "assets/models/crafter/negev.glb?v=20260808-normal-alpha-1" },
    { matches: ["p250 | see ya later"], url: "assets/models/crafter/p250.glb?v=20260808-normal-alpha-1" },
    { matches: ["ssg 08 | blood in the water"], url: "assets/models/crafter/ssg.glb?v=20260808-normal-alpha-1" },
    { matches: ["nova | antique"], url: "assets/models/crafter/galil.glb?v=20260808-normal-alpha-1" },
    { matches: ["ak-47", "ak47"], url: "assets/models/base/weapons/models/ak47/weapon_rif_ak47.glb" },
    { matches: ["aug"], url: "assets/models/base/weapons/models/aug/weapon_rif_aug.glb" },
    { matches: ["awp"], url: "assets/models/base/weapons/models/awp/weapon_snip_awp.glb" },
    { matches: ["pp-bizon", "pp bizon", "bizon"], url: "assets/models/base/weapons/models/bizon/weapon_smg_bizon.glb" },
    { matches: ["cz75-auto", "cz75 auto", "cz75a"], url: "assets/models/base/weapons/models/cz75a/weapon_pist_cz75a.glb" },
    { matches: ["desert eagle"], url: "assets/models/base/weapons/models/deagle/weapon_pist_deagle.glb" },
    { matches: ["dual berettas", "dualies"], url: "assets/models/base/weapons/models/elite/weapon_pist_elite.glb" },
    { matches: ["famas"], url: "assets/models/base/weapons/models/famas/weapon_rif_famas.glb" },
    { matches: ["five-seven", "five seven", "fiveseven"], url: "assets/models/base/weapons/models/fiveseven/weapon_pist_fiveseven.glb" },
    { matches: ["g3sg1", "g3sg-1"], url: "assets/models/base/weapons/models/g3sg1/weapon_snip_g3sg1.glb" },
    { matches: ["galil ar", "galil", "galilar"], url: "assets/models/base/weapons/models/galilar/weapon_rif_galilar.glb" },
    { matches: ["glock-18", "glock 18", "glock18"], url: "assets/models/base/weapons/models/glock18/weapon_pist_glock18.glb?v=20260827-glock-skinglockggod-1" },
    { matches: ["p2000"], url: "assets/models/base/weapons/models/hkp2000/weapon_pist_hkp2000.glb" },
    { matches: ["m249"], url: "assets/models/base/weapons/models/m249/weapon_mach_m249.glb" },
    { matches: ["m4a1-s", "m4a1 s", "m4a1s"], url: "assets/models/base/weapons/models/m4a1_silencer/weapon_rif_m4a1_silencer.glb" },
    { matches: ["m4a4"], url: "assets/models/base/weapons/models/m4a4/weapon_rif_m4a4.glb" },
    { matches: ["mac-10", "mac 10", "mac10"], url: "assets/models/base/weapons/models/mac10/weapon_smg_mac10.glb" },
    { matches: ["mag-7", "mag 7", "mag7"], url: "assets/models/base/weapons/models/mag7/weapon_shot_mag7.glb" },
    { matches: ["mp5-sd", "mp5 sd", "mp5sd"], url: "assets/models/base/weapons/models/mp5sd/weapon_smg_mp5sd.glb" },
    { matches: ["mp7"], url: "assets/models/base/weapons/models/mp7/weapon_smg_mp7.glb" },
    { matches: ["mp9"], url: "assets/models/base/weapons/models/mp9/weapon_smg_mp9.glb" },
    { matches: ["negev"], url: "assets/models/base/weapons/models/negev/weapon_mach_negev.glb" },
    { matches: ["nova"], url: "assets/models/base/weapons/models/nova/weapon_shot_nova.glb" },
    { matches: ["p250"], url: "assets/models/base/weapons/models/p250/weapon_pist_p250.glb" },
    { matches: ["p90"], url: "assets/models/base/weapons/models/p90/weapon_smg_p90.glb" },
    { matches: ["r8 revolver", "r8"], url: "assets/models/base/weapons/models/revolver/weapon_pist_revolver.glb" },
    { matches: ["sawed-off", "sawed off", "sawedoff"], url: "assets/models/base/weapons/models/sawedoff/weapon_shot_sawedoff.glb" },
    { matches: ["scar-20", "scar 20", "scar20"], url: "assets/models/base/weapons/models/scar20/weapon_snip_scar20.glb" },
    { matches: ["sg 553", "sg-553", "sg553"], url: "assets/models/base/weapons/models/sg556/weapon_rif_sg556.glb" },
    { matches: ["ssg 08", "ssg-08", "ssg08"], url: "assets/models/base/weapons/models/ssg08/weapon_snip_ssg08.glb" },
    { matches: ["zeus x27", "zeus"], url: "assets/models/base/weapons/models/taser/weapon_pist_taser.glb" },
    { matches: ["tec-9", "tec 9", "tec9"], url: "assets/models/base/weapons/models/tec9/weapon_pist_tec9.glb" },
    { matches: ["ump-45", "ump 45", "ump45"], url: "assets/models/base/weapons/models/ump45/weapon_smg_ump45.glb" },
    { matches: ["usp-s", "usp s", "usps"], url: "assets/models/base/weapons/models/usp_silencer/weapon_pist_usp_silencer.glb" },
    { matches: ["xm1014"], url: "assets/models/base/weapons/models/xm1014/weapon_shot_xm1014.glb" },
  ];

  const KNIFE_MODEL_TOKENS = [
    { matches: ["kukri knife", "kukri"], url: "assets/models/base/weapons/models/knife/knife_kukri/weapon_knife_kukri.glb" },
    { matches: ["m9 bayonet"], url: "assets/models/base/weapons/models/knife/knife_m9/weapon_knife_m9.glb" },
    { matches: ["bowie knife", "survival bowie"], url: "assets/models/base/weapons/models/knife/knife_bowie/weapon_knife_bowie.glb" },
    { matches: ["butterfly knife"], url: "assets/models/base/weapons/models/knife/knife_butterfly/weapon_knife_butterfly.glb" },
    { matches: ["classic knife"], url: "assets/models/base/weapons/models/knife/knife_css/weapon_knife_css.glb" },
    { matches: ["falchion knife"], url: "assets/models/base/weapons/models/knife/knife_falchion/weapon_knife_falchion.glb" },
    { matches: ["flip knife"], url: "assets/models/base/weapons/models/knife/knife_flip/weapon_knife_flip.glb" },
    { matches: ["gut knife"], url: "assets/models/base/weapons/models/knife/knife_gut/weapon_knife_gut.glb" },
    { matches: ["huntsman knife"], url: "assets/models/base/weapons/models/knife/knife_tactical/weapon_knife_tactical.glb" },
    { matches: ["karambit"], url: "assets/models/base/weapons/models/knife/knife_karambit/weapon_knife_karambit.glb" },
    { matches: ["navaja knife"], url: "assets/models/base/weapons/models/knife/knife_navaja/weapon_knife_navaja.glb" },
    { matches: ["nomad knife"], url: "assets/models/base/weapons/models/knife/knife_outdoor/weapon_knife_outdoor.glb" },
    { matches: ["paracord knife"], url: "assets/models/base/weapons/models/knife/knife_cord/weapon_knife_cord.glb" },
    { matches: ["shadow daggers"], url: "assets/models/base/weapons/models/knife/knife_push/weapon_knife_push.glb" },
    { matches: ["skeleton knife"], url: "assets/models/base/weapons/models/knife/knife_skeleton/weapon_knife_skeleton.glb" },
    { matches: ["stiletto knife"], url: "assets/models/base/weapons/models/knife/knife_stiletto/weapon_knife_stiletto.glb" },
    { matches: ["talon knife"], url: "assets/models/base/weapons/models/knife/knife_talon/weapon_knife_talon.glb" },
    { matches: ["ursus knife"], url: "assets/models/base/weapons/models/knife/knife_ursus/weapon_knife_ursus.glb" },
    { matches: ["bayonet"], url: "assets/models/base/weapons/models/knife/knife_bayonet/weapon_knife_bayonet.glb" },
  ];

  const WEAR_OPTIONS = [
    "Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred",
  ];

  const WEAR_FLOAT_DEFAULTS = {
    "Factory New": 0.03,
    "Minimal Wear": 0.11,
    "Field-Tested": 0.25,
    "Well-Worn": 0.41,
    "Battle-Scarred": 0.75,
  };

  function wearLabelFromFloat(floatValue) {
    const value = Number(floatValue);
    if (!Number.isFinite(value)) return "Field-Tested";
    if (value < 0.07) return "Factory New";
    if (value < 0.15) return "Minimal Wear";
    if (value < 0.38) return "Field-Tested";
    if (value < 0.45) return "Well-Worn";
    return "Battle-Scarred";
  }

  function normalizeMarketName(value) {
    return String(value || "").trim().toLowerCase();
  }

  function splitSteamWearName(value) {
    const trimmed = String(value || "").trim();
    const match = trimmed.match(/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/);
    if (!match) return [trimmed, ""];
    return [String(match[1] || "").trim(), String(match[2] || "").trim()];
  }

  function stripItemNamePrefix(value) {
    return String(value || "").trim().replace(/^(\?|★)\s*/u, "");
  }

  function resolveKnifeModelUrl(itemTitle) {
    const weaponPart = String(itemTitle || "").replace(/^★\s*/u, "").split("|")[0].trim().toLowerCase();
    if (!weaponPart) return "";
    for (const entry of KNIFE_MODEL_TOKENS) {
      if (entry.matches.some((match) => weaponPart.includes(match))) return entry.url;
    }
    return "";
  }

  function resolveLocalModelUrl(itemTitle) {
    const knifeUrl = resolveKnifeModelUrl(itemTitle);
    if (knifeUrl) return knifeUrl;
    const normalized = String(itemTitle || "").toLowerCase();
    const entry = LOCAL_MODEL_MATCHERS.find((candidate) => candidate.matches.some((match) => normalized.includes(match)));
    return entry?.url || "";
  }

  function isUnpaintedBaseModelUrl(url) {
    return /assets\/models\/base\//i.test(String(url || ""));
  }

  function resolveCrafterLookupKey(value) {
    const stripped = String(value || "")
      .trim()
      .replace(/^[\s★*\u2605]+/u, "")
      .replace(/^(souvenir|stattrak™|stattrak)\s+/i, "");
    const [base] = splitSteamWearName(stripped);
    return normalizeMarketName(base);
  }

  function findCrafterLibraryEntry(libraryItems, names) {
    const items = Array.isArray(libraryItems) ? libraryItems : [];
    const targets = new Set(
      (Array.isArray(names) ? names : [names])
        .map((value) => resolveCrafterLookupKey(value))
        .filter(Boolean)
    );
    if (!targets.size || !items.length) return null;

    return items.find((entry) => {
      const key = resolveCrafterLookupKey(entry?.market_name || entry?.display_name || "");
      return Boolean(key && targets.has(key));
    }) || null;
  }

  function resolveCrafterBakedModelUrl(libraryItems, names) {
    const entry = findCrafterLibraryEntry(libraryItems, names);
    if (!entry || entry.has_baked_model === false) return "";
    return String(entry.model_url || "").trim();
  }

  let crafterBatchLibrary = null;
  let crafterBatchLibraryPromise = null;

  function getCrafterBatchLibrary() {
    return Array.isArray(crafterBatchLibrary) ? crafterBatchLibrary : null;
  }

  function loadCrafterBatchLibrary() {
    if (Array.isArray(crafterBatchLibrary)) return Promise.resolve(crafterBatchLibrary);
    if (crafterBatchLibraryPromise) return crafterBatchLibraryPromise;
    crafterBatchLibraryPromise = fetch("get_crafter_batch_library.php", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        crafterBatchLibrary = Array.isArray(payload?.items) ? payload.items : [];
        return crafterBatchLibrary;
      })
      .catch(() => {
        crafterBatchLibrary = [];
        return crafterBatchLibrary;
      });
    return crafterBatchLibraryPromise;
  }

  function normalizeModelManifestEntries(payload) {
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload)) return payload;
    return [];
  }

  function resolveManifestModelEntry(entries, names) {
    const targets = Array.from(new Set((Array.isArray(names) ? names : [names])
      .map((value) => normalizeMarketName(value))
      .filter(Boolean)));
    if (!targets.length) return null;

    const exact = entries.find((entry) => targets.includes(normalizeMarketName(entry?.market_name || entry?.display_name || "")));
    if (exact) return exact;

    return entries.find((entry) => {
      const candidateName = normalizeMarketName(entry?.market_name || entry?.display_name || "");
      if (!candidateName) return false;
      const [candidateBase] = splitSteamWearName(stripItemNamePrefix(candidateName));
      return targets.some((target) => {
        const [targetBase] = splitSteamWearName(stripItemNamePrefix(target));
        return normalizeMarketName(candidateBase) === normalizeMarketName(targetBase);
      });
    }) || null;
  }

  function pickPreviewAnimation(animations, preferredName) {
    const list = Array.isArray(animations) ? animations.filter(Boolean) : [];
    if (!list.length) return null;
    const normalizedPreferred = normalizeMarketName(preferredName);
    if (normalizedPreferred) {
      const exact = list.find((clip) => normalizeMarketName(clip?.name) === normalizedPreferred);
      if (exact) return exact;
    }
    // NB: the inventory_icon / inventory_inspect clips look like the obvious
    // choice here, but they carry their own orientation, which would shift the
    // baseline every weapon pose correction is measured against. Leave the
    // selection alone — the off-centre bug was the pose being applied after
    // framing, not which clip was chosen.
    const priorityTokens = ["preview", "idle", "pose", "stand", "tools", "default"];
    return list.find((clip) => priorityTokens.some((token) => normalizeMarketName(clip?.name).includes(token))) || list[0];
  }

  function resolvePreviewPoseTime(clip, configuredTime) {
    const explicit = Number(configuredTime);
    if (Number.isFinite(explicit) && explicit >= 0) return explicit;
    const duration = Number(clip?.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return Math.max(0.12, Math.min(duration * 0.32, 0.8));
  }

  function buildSkinViewerRarityStyle(hexValue) {
    const hex = String(hexValue || "4b69ff").replace(/^#/, "").slice(0, 6).padEnd(6, "0");
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    return {
      "--rarity-accent": `#${hex}`,
      "--card-accent": `#${hex}`,
      "--rarity-glow": `rgba(${red}, ${green}, ${blue}, 0.34)`,
      "--rarity-mid": `rgba(${red}, ${green}, ${blue}, 0.18)`,
      "--rarity-ring": `rgba(${red}, ${green}, ${blue}, 0.42)`,
      "--rarity-deep": `rgba(${Math.max(0, Math.round(red * 0.24))}, ${Math.max(0, Math.round(green * 0.24))}, ${Math.max(0, Math.round(blue * 0.24))}, 0.28)`,
    };
  }

  function resolveVisualType(category, typeNote, title) {
    const itemTitle = String(title || "").trim();
    if (/^★/u.test(itemTitle) && itemTitle.includes("|") && !/glove/i.test(itemTitle)) return "knives";
    const hint = `${category || ""} ${typeNote || ""} ${title || ""}`.toLowerCase();
    if (/agent/.test(hint)) return "agents";
    if (/knife|★/.test(hint) || resolveKnifeModelUrl(title)) return "knives";
    if (/glove/.test(hint)) return "gloves";
    if (/pistol/.test(hint)) return "pistols";
    if (/rifle/.test(hint)) return "rifles";
    if (/smg/.test(hint)) return "smgs";
    if (/shotgun/.test(hint)) return "shotguns";
    if (/sniper|awp|ssg 08/.test(hint)) return "snipers";
    if (/heavy|machinegun/.test(hint)) return "heavy";
    if (/sticker|patch/.test(hint)) return "stickers";
    if (/case|container|capsule|package/.test(hint)) return "containers";
    return "items";
  }

  function enhanceViewerMaterials(material, three, options = {}) {
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((mat) => {
      if (!mat) return;
      if (mat.map) {
        mat.map.encoding = three.sRGBEncoding;
        mat.map.needsUpdate = true;
        if (options.isHydroSkin && !options.preferBakedModel) {
          mat.map.wrapS = three.RepeatWrapping;
          mat.map.wrapT = three.RepeatWrapping;
          mat.map.repeat.set(14, 14);
          mat.map.offset.set(0, 0.97);
        } else if (options.glockLegacyPaint && mat.map && three.ClampToEdgeWrapping != null) {
          // Unique Glock atlas (Wasteland Rebel, etc.) lives in 0–1. RepeatWrapping
          // plus DoubleSide on the open LOD made the rear/grip smear.
          mat.map.wrapS = three.ClampToEdgeWrapping;
          mat.map.wrapT = three.ClampToEdgeWrapping;
          mat.map.repeat.set(1, 1);
          mat.map.offset.set(0, 0);
        } else if (options.preferBakedModel && mat.map) {
          // Legacy CS2 skins (Cartel, etc.) author UVs outside 0–1; clamp zebra-shades mag/grip.
          mat.map.wrapS = three.RepeatWrapping;
          mat.map.wrapT = three.RepeatWrapping;
          mat.map.repeat.set(1, 1);
          mat.map.offset.set(0, 0);
        }
      }
      if (mat.emissiveMap) {
        mat.emissiveMap.encoding = three.sRGBEncoding;
        mat.emissiveMap.needsUpdate = true;
      }
      if (mat.normalMap) {
        // Source exports sometimes store normals with alpha=0; premultiply would wipe RGB to black.
        mat.normalMap.premultiplyAlpha = false;
        mat.normalMap.encoding = three.LinearEncoding;
        mat.normalMap.needsUpdate = true;
      }
      if (mat.roughnessMap) mat.roughnessMap.needsUpdate = true;
      if (mat.metalnessMap) mat.metalnessMap.needsUpdate = true;
      if (options.preferBakedModel || options.glockLegacyPaint) {
        const wrap = options.glockLegacyPaint && three.ClampToEdgeWrapping != null
          ? three.ClampToEdgeWrapping
          : three.RepeatWrapping;
        [
          mat.map,
          mat.normalMap,
          mat.roughnessMap,
          mat.metalnessMap,
          mat.aoMap,
          mat.emissiveMap,
        ].forEach((texture) => {
          if (!texture) return;
          texture.wrapS = wrap;
          texture.wrapT = wrap;
          texture.repeat.set(1, 1);
          texture.offset.set(0, 0);
          texture.needsUpdate = true;
        });
      }
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        if (options.preferBakedModel) {
          // Crafter/Source GLBs omit metallicFactor (glTF default 1). With no
          // env map, that kills Lambert and the gun reads as a black void.
          // Match the painted Glock path: mostly dielectric so studio lights
          // show albedo. Keep a little metal so hardware still picks up the key.
          mat.metalness = 0.26;
          mat.roughness = Math.min(Math.max(Number(mat.roughness) || 0.42, 0.36), 0.55);
          mat.envMapIntensity = 1.1;
        } else {
          mat.metalness = Math.min(Math.max(mat.metalness ?? 0.28, 0.05), 0.55);
          mat.roughness = Math.min(Math.max(mat.roughness ?? 0.38, 0.15), 0.65);
          mat.envMapIntensity = 1.05;
        }
      }
      // Source2Viewer weapon bakes often have inward/open rear faces; Windows 3D Viewer
      // draws both sides so the grip/slide back looks solid — match that here.
      // Glock LOD is a thin open shell: DoubleSide shows the slide interior as
      // stretched graffiti. Those meshes get a flipped inner shell instead.
      if (options.preferBakedModel && !options.glockLegacyPaint && three.DoubleSide != null) {
        mat.side = three.DoubleSide;
      }
      mat.needsUpdate = true;
    });
  }

  function isLegacyViewerMesh(child) {
    const name = String(child?.name || "").toLowerCase();
    if (name.includes("body_legacy")) return false;
    return /legacy|firstperson|defusekit|magazine|clip|shell|bullet|scope_lens|glass|lod1|lod2|lod3|viewmodel/.test(name);
  }

  function isGlockLegacyPaintMesh(child) {
    const name = String(child?.name || "").toLowerCase();
    return /glock18|pist_glock/.test(name) && name.includes("body_legacy");
  }

  function bindGlockAtlasToAoUv(geometry) {
    if (!geometry?.attributes?.uv) return;
    // Default Glock ORM/AO is authored on TEXCOORD_0. GLTFLoader stores
    // TEXCOORD_1 (CS2 paint-wrap) as uv2, which StandardMaterial uses for aoMap.
    if (geometry.attributes.uv2 && !geometry.userData.glockPaintUv) {
      geometry.userData.glockPaintUv = geometry.attributes.uv2;
    }
    geometry.setAttribute("uv2", geometry.attributes.uv.clone());
  }

  function appendGlockInnerShell(geometry, three) {
    if (!geometry?.attributes?.position || geometry.userData?.glockInnerShell) return geometry;
    const pos = geometry.attributes.position;
    const nrm = geometry.attributes.normal;
    const vertCount = pos.count;
    const names = Object.keys(geometry.attributes);
    const next = new three.BufferGeometry();
    next.morphAttributes = geometry.morphAttributes;
    next.morphTargetsRelative = geometry.morphTargetsRelative;

    names.forEach((name) => {
      const attr = geometry.attributes[name];
      const ArrayType = attr.array.constructor;
      const merged = new ArrayType(attr.array.length * 2);
      merged.set(attr.array, 0);
      if (name === "normal") {
        for (let i = 0; i < attr.array.length; i += 1) merged[attr.array.length + i] = -attr.array[i];
      } else if (name === "position" && nrm) {
        const eps = 0.012;
        const pa = attr.array;
        const na = nrm.array;
        const nComp = attr.itemSize;
        const nrmSize = nrm.itemSize;
        for (let i = 0; i < vertCount; i += 1) {
          const dst = (vertCount + i) * nComp;
          const src = i * nComp;
          const ns = i * nrmSize;
          merged[dst] = pa[src] - na[ns] * eps;
          merged[dst + 1] = pa[src + 1] - na[ns + 1] * eps;
          if (nComp > 2) merged[dst + 2] = pa[src + 2] - na[ns + 2] * eps;
        }
      } else {
        merged.set(attr.array, attr.array.length);
      }
      next.setAttribute(name, new three.BufferAttribute(merged, attr.itemSize, attr.normalized));
    });

    if (geometry.index) {
      const srcArr = geometry.index.array;
      const IndexType = (vertCount * 2) > 65535 ? Uint32Array : srcArr.constructor;
      const merged = new IndexType(srcArr.length * 2);
      merged.set(srcArr, 0);
      for (let i = 0; i < srcArr.length; i += 3) {
        merged[srcArr.length + i] = srcArr[i] + vertCount;
        merged[srcArr.length + i + 1] = srcArr[i + 2] + vertCount;
        merged[srcArr.length + i + 2] = srcArr[i + 1] + vertCount;
      }
      next.setIndex(new three.BufferAttribute(merged, 1));
    }
    if (Array.isArray(geometry.groups) && geometry.groups.length) {
      const groups = geometry.groups.map((group) => ({ ...group }));
      geometry.groups.forEach((group) => {
        groups.push({
          start: group.start + (geometry.index ? geometry.index.count : vertCount),
          count: group.count,
          materialIndex: group.materialIndex,
        });
      });
      next.groups = groups;
    }
    next.userData.glockInnerShell = true;
    next.computeBoundingSphere?.();
    next.computeBoundingBox?.();
    return next;
  }

  function prepareGlockLegacyPaintMesh(child, three) {
    if (!child?.isMesh || !isGlockLegacyPaintMesh(child) || child.userData.glockLegacyPrepared) return;
    bindGlockAtlasToAoUv(child.geometry);
    child.geometry = appendGlockInnerShell(child.geometry, three);
    bindGlockAtlasToAoUv(child.geometry);
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => {
      if (!mat) return;
      if (three.FrontSide != null) mat.side = three.FrontSide;
      mat.needsUpdate = true;
    });
    child.userData.glockLegacyPrepared = true;
  }

  function isUnderCraftAttachment(child) {
    let node = child;
    while (node) {
      if (node.userData?.craftAttachment || node.userData?.craftPreview) return true;
      node = node.parent;
    }
    return false;
  }

  function isViewerBoundsMesh(child) {
    if (!child?.visible || !child?.isMesh || !child.geometry) return false;
    if (child.userData?.viewerHand || child.userData?.craftAttachment || child.userData?.craftPart) return false;
    if (isUnderCraftAttachment(child)) return false;
    if (isLegacyViewerMesh(child)) return false;
    const name = String(child?.name || "").toLowerCase();
    if (/^(cube|icosphere|sphere|plane)$/.test(name)) return false;
    return true;
  }

  // Vertex-average of visible body meshes — better optical center than AABB for long guns
  // whose visual mass sits toward the receiver/stock (AABB then looks right-shifted).
  function computeGunOpticalCenter(modelRoot, three) {
    if (!modelRoot || !three) return null;
    modelRoot.updateMatrixWorld(true);
    const point = new three.Vector3();
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let weight = 0;
    const preferred = [];
    const fallback = [];

    modelRoot.traverse((child) => {
      if (!isViewerBoundsMesh(child) || !child.geometry?.attributes?.position) return;
      const name = String(child.name || "").toLowerCase();
      if (/body_hd|body_legacy|^body$|_body\b|weapon_body|gun_body/.test(name)) {
        preferred.push(child);
      } else {
        fallback.push(child);
      }
    });
    const meshes = preferred.length ? preferred : fallback;
    meshes.forEach((child) => {
      const pos = child.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 500));
      for (let i = 0; i < pos.count; i += step) {
        point.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
        sx += point.x;
        sy += point.y;
        sz += point.z;
        weight += 1;
      }
    });
    if (weight < 8) return null;
    return new three.Vector3(sx / weight, sy / weight, sz / weight);
  }

  function centerGunModelInView(modelRoot, three, options = {}) {
    if (!modelRoot || !three) return;
    modelRoot.updateMatrixWorld(true);
    const bounds = computeViewerBounds(modelRoot, three, options);
    const aabbCenter = bounds.getCenter(new three.Vector3());
    modelRoot.position.sub(aabbCenter);
    modelRoot.updateMatrixWorld(true);
    // Previously applied a small "optical" nudge (vertex-average bias) on top of the
    // AABB centering here, meant to correct for long guns looking right-heavy. In
    // practice it consistently pushed models down-and-right of true center in the
    // crafter viewport, so it's removed — the plain AABB center is what "centered"
    // means for this viewer.
  }

  function isSkinPaintMesh(child) {
    if (!child?.isMesh || isLegacyViewerMesh(child)) return false;
    const name = String(child?.name || "").toLowerCase();
    if (/sticker|scope|lens|glass|suppressor_cap|silencer_cap/.test(name)) return false;
    return true;
  }

  function applyWearFloatToModel(modelRoot, wearFloat, three, options = {}) {
    if (!modelRoot || !three) return;
    if (options.preferBakedModel) return;
    const value = Math.min(1, Math.max(0, Number(wearFloat ?? 0.25)));
    const wearRoughness = 0.12 + value * 0.58;
    const hasRoughnessMap = Boolean(options.hasRoughnessMap);
    const hasWearMap = Boolean(options.hasWearMap);

    modelRoot.traverse((child) => {
      if (!child?.isMesh || isLegacyViewerMesh(child)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat) return;
        if (hasRoughnessMap && mat.roughnessMap) {
          mat.roughness = 1;
          if (hasWearMap && mat.aoMap) {
            mat.aoMapIntensity = 0.35 + value * 1.15;
          }
        } else if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
          mat.roughness = wearRoughness;
        }
        if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
          mat.metalness = 0.18 + (1 - value) * 0.12;
        }
        mat.needsUpdate = true;
      });
    });
  }

  function applyRuntimeSkinTextures(modelRoot, texturePack, three, options = {}) {
    if (!modelRoot || !texturePack?.albedo || !three?.TextureLoader) {
      return Promise.resolve({ applied: false, hasRoughnessMap: false, hasWearMap: false });
    }

    const wearFloat = Math.min(1, Math.max(0, Number(options.wearFloat ?? 0.25)));
    const loader = new three.TextureLoader();
    const loadTexture = (url, encoding, flipY = true) => new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }
      loader.load(
        url,
        (texture) => {
          texture.encoding = encoding;
          texture.flipY = flipY;
          texture.needsUpdate = true;
          resolve(texture);
        },
        undefined,
        () => resolve(null)
      );
    });

    return Promise.all([
      loadTexture(texturePack.albedo, three.sRGBEncoding, true),
      loadTexture(texturePack.normal, three.LinearEncoding, true),
      loadTexture(texturePack.roughness, three.LinearEncoding, true),
      loadTexture(texturePack.wear, three.LinearEncoding, true),
      loadTexture(texturePack.ao, three.LinearEncoding, true),
    ]).then(([map, normalMap, roughnessMap, wearMap]) => {
      if (!map) return { applied: false, hasRoughnessMap: false, hasWearMap: false };

      const wearRoughness = 0.12 + wearFloat * 0.58;

      modelRoot.traverse((child) => {
        if (!isSkinPaintMesh(child)) return;

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (!mat) return;
          mat.map = map;
          if (normalMap) {
            mat.normalMap = normalMap;
            mat.normalScale = mat.normalScale || new three.Vector2(1, 1);
          }
          if (roughnessMap) {
            mat.roughnessMap = roughnessMap;
            mat.roughness = 1;
          } else {
            mat.roughness = wearRoughness;
          }
          if (wearMap) {
            mat.aoMap = wearMap;
            mat.aoMapIntensity = 0.35 + wearFloat * 1.15;
          }
          if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
            mat.metalness = 0.18 + (1 - wearFloat) * 0.12;
            mat.envMapIntensity = 1.1;
          }
          enhanceViewerMaterials(mat, three, {
            glockLegacyPaint: isGlockLegacyPaintMesh(child),
          });
        });
      });

      return {
        applied: true,
        hasRoughnessMap: Boolean(roughnessMap),
        hasWearMap: Boolean(wearMap),
      };
    });
  }

  async function resolveSkinViewerAssets(names) {
    const label = Array.isArray(names) ? names.find(Boolean) : names;
    if (!label) return null;

    try {
      const response = await fetch(`get_skin_viewer_assets.php?market_hash_name=${encodeURIComponent(String(label))}`, {
        cache: "no-store",
      });
      if (!response.ok) return null;
      const json = await response.json();
      if (!json || typeof json !== "object") return null;
      return json;
    } catch (_error) {
      return null;
    }
  }

  function buildWearMarketHashName(baseName, wear) {
    const base = String(baseName || "").trim();
    const wearLabel = String(wear || "").trim();
    if (!base || !wearLabel) return base;
    return `${base} (${wearLabel})`;
  }

  function buildSteamMarketUrl(marketHashName) {
    const safeName = String(marketHashName || "").trim();
    return safeName
      ? `https://steamcommunity.com/market/listings/730/${encodeURIComponent(safeName)}`
      : "";
  }

  function buildItemPageHref(item, wear) {
    const baseName = stripItemNamePrefix(item?.display_name || item?.market_hash_name || "");
    const marketHashName = buildWearMarketHashName(baseName, wear || item?.selected_wear || "Factory New");
    const params = new URLSearchParams({
      lookup_name: baseName,
      display_name: baseName,
      market_hash_name: marketHashName,
      image: String(item?.image || ""),
      market_url: buildSteamMarketUrl(marketHashName),
      type: String(item?.type_note || ""),
      category: String(item?.category_label || item?.category || ""),
      color: String(item?.name_color || "B0C3D9"),
    });
    if (baseName.includes("|")) {
      params.set("selected_wear", wear || item?.selected_wear || "Factory New");
    }
    return `item_page.php?${params.toString()}`;
  }

  function slugToMarketName(slug) {
    return String(slug || "")
      .split("-")
      .map((part) => {
        if (part === "stattrak") return "StatTrak™";
        if (part === "souvenir") return "Souvenir";
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ")
      .replace(/\s+\|\s+/g, " | ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const SKINPORT_WEAPON_PREFIXES = [
    ["m4a1-s", "M4A1-S"],
    ["sg-553", "SG 553"],
    ["ssg-08", "SSG 08"],
    ["cz75-auto", "CZ75-Auto"],
    ["dual-berettas", "Dual Berettas"],
    ["glock-18", "Glock-18"],
    ["galil-ar", "Galil AR"],
    ["mac-10", "MAC-10"],
    ["mag-7", "MAG-7"],
    ["mp5-sd", "MP5-SD"],
    ["pp-bizon", "PP-Bizon"],
    ["r8-revolver", "R8 Revolver"],
    ["sawed-off", "Sawed-Off"],
    ["ump-45", "UMP-45"],
    ["usp-s", "USP-S"],
    ["desert-eagle", "Desert Eagle"],
    ["five-seven", "Five-SeveN"],
    ["tec-9", "Tec-9"],
    ["ak-47", "AK-47"],
    ["m4a4", "M4A4"],
    ["awp", "AWP"],
    ["p250", "P250"],
    ["p2000", "P2000"],
    ["p90", "P90"],
    ["mp7", "MP7"],
    ["mp9", "MP9"],
    ["nova", "Nova"],
    ["xm1014", "XM1014"],
    ["negev", "Negev"],
    ["m249", "M249"],
    ["famas", "FAMAS"],
    ["aug", "AUG"],
    ["g3sg1", "G3SG1"],
    ["scar-20", "SCAR-20"],
    ["bayonet", "Bayonet"],
    ["karambit", "Karambit"],
    ["butterfly-knife", "Butterfly Knife"],
    ["m9-bayonet", "M9 Bayonet"],
    ["bowie-knife", "Bowie Knife"],
    ["falchion-knife", "Falchion Knife"],
    ["flip-knife", "Flip Knife"],
    ["gut-knife", "Gut Knife"],
    ["huntsman-knife", "Huntsman Knife"],
    ["navaja-knife", "Navaja Knife"],
    ["nomad-knife", "Nomad Knife"],
    ["paracord-knife", "Paracord Knife"],
    ["shadow-daggers", "Shadow Daggers"],
    ["skeleton-knife", "Skeleton Knife"],
    ["stiletto-knife", "Stiletto Knife"],
    ["talon-knife", "Talon Knife"],
    ["ursus-knife", "Ursus Knife"],
    ["classic-knife", "Classic Knife"],
    ["kukri-knife", "Kukri Knife"],
  ];

  const WEAR_SLUGS = {
    "factory-new": "Factory New",
    "minimal-wear": "Minimal Wear",
    "field-tested": "Field-Tested",
    "well-worn": "Well-Worn",
    "battle-scarred": "Battle-Scarred",
    fn: "Factory New",
    mw: "Minimal Wear",
    ft: "Field-Tested",
    ww: "Well-Worn",
    bs: "Battle-Scarred",
  };

  const WEAPON_STICKER_CLASS_SCALE = {
    pistol: 0.88,
    smg: 0.82,
    rifle: 0.9,
    sniper: 0.78,
    shotgun: 0.8,
    mg: 0.48,
    knife: 0.72,
    equipment: 0.76,
    default: 0.86,
  };

  const CRAFT_STICKER_SIZE_MULTIPLIER = 1.65;

  const WEAPON_STICKER_CLASS = {
    "Glock-18": "pistol",
    "P2000": "pistol",
    "USP-S": "pistol",
    "Dual Berettas": "pistol",
    "P250": "pistol",
    "Tec-9": "pistol",
    "Five-SeveN": "pistol",
    "CZ75-Auto": "pistol",
    "Desert Eagle": "pistol",
    "R8 Revolver": "pistol",
    "MAC-10": "smg",
    "MP9": "smg",
    "MP7": "smg",
    "MP5-SD": "smg",
    "UMP-45": "smg",
    "P90": "smg",
    "PP-Bizon": "smg",
    "Galil AR": "rifle",
    "FAMAS": "rifle",
    "AK-47": "rifle",
    "M4A4": "rifle",
    "M4A1-S": "rifle",
    "SG 553": "rifle",
    "AUG": "rifle",
    "SSG 08": "sniper",
    "AWP": "sniper",
    "G3SG1": "sniper",
    "SCAR-20": "sniper",
    "Nova": "shotgun",
    "XM1014": "shotgun",
    "Sawed-Off": "shotgun",
    "MAG-7": "shotgun",
    "Negev": "mg",
    "M249": "mg",
    "Zeus x27": "equipment",
  };

  // Slot scales follow CS2 preset size changes (left-to-right crafter slots).
  // https://steamcommunity.com/sharedfiles/filedetails/?id=3277710006
  const WEAPON_STICKER_SLOT_SCALE = {
    "M4A4": [0.78, 1.06, 1.06, 1, 1],
    "FAMAS": [1, 1, 0.88, 0.92, 0.78],
    "AUG": [0.82, 1, 1, 1, 1],
    "M4A1-S": [0.88, 1, 1, 1, 0.92],
    "AWP": [1, 1, 0.86, 1, 1],
    "MP9": [1, 1, 1, 1.08, 1],
    "MP7": [0.82, 1, 1.08, 1, 0.88],
    "MP5-SD": [1, 1.04, 1.06, 1, 1],
    "P90": [0.82, 1, 0.72, 1, 1],
    "Glock-18": [1, 1, 1, 0.86, 1],
    "P2000": [1, 1, 1, 0.86, 1],
    "USP-S": [0.92, 1, 1, 1, 0.86],
    "P250": [1.06, 1, 1.06, 0.86, 1],
    "Five-SeveN": [1.06, 1, 1.06, 0.86, 1],
    "CZ75-Auto": [1.06, 1, 1.06, 1, 1],
    "Nova": [1, 1, 1, 1, 0.82],
    "XM1014": [1.08, 1, 1, 1, 1],
    "Sawed-Off": [1.08, 1, 1, 1, 1],
  };

  // Relative anchor offsets from model bounds center: [xAlongBarrel, yHeight, zFaceOut].
  // Pistols: slots 0-2 on slide (rear→front), slot 3 on grip — matches CS2 inspect defaults.
  const PISTOL_STICKER_SLOT_ANCHORS = [
    [-0.30, 0.06, 0.20],
    [-0.05, 0.03, 0.22],
    [0.22, 0.04, 0.20],
    [-0.14, -0.30, 0.12],
    [0.32, 0.01, 0.16],
  ];

  // Side-profile anchors for non-pistol classes (barrel ±X, grip −Y, camera-facing +Z).
  const SMG_STICKER_SLOT_ANCHORS = [
    [-0.24, 0.03, 0.22],
    [-0.06, 0.02, 0.24],
    [0.14, 0.02, 0.24],
    [0.30, 0.01, 0.20],
    [-0.08, -0.10, 0.18],
  ];
  const RIFLE_STICKER_SLOT_ANCHORS = [
    [-0.30, 0.02, 0.22],
    [-0.10, 0.02, 0.24],
    [0.10, 0.02, 0.24],
    [0.30, 0.01, 0.22],
    [0.44, 0.01, 0.18],
  ];
  const SNIPER_STICKER_SLOT_ANCHORS = [
    [-0.26, 0.02, 0.20],
    [-0.06, 0.01, 0.22],
    [0.14, 0.01, 0.22],
    [0.34, 0.01, 0.20],
    [0.50, 0.01, 0.16],
  ];
  const SHOTGUN_STICKER_SLOT_ANCHORS = [
    [-0.22, 0.03, 0.22],
    [-0.02, 0.02, 0.24],
    [0.18, 0.02, 0.24],
    [0.34, 0.01, 0.20],
    [0.08, -0.08, 0.18],
  ];
  const MG_STICKER_SLOT_ANCHORS = [
    [-0.28, 0.02, 0.22],
    [-0.06, 0.02, 0.24],
    [0.16, 0.02, 0.24],
    [0.36, 0.01, 0.20],
    [0.48, 0.01, 0.16],
  ];
  const WEAPON_CLASS_STICKER_SLOT_ANCHORS = {
    pistol: PISTOL_STICKER_SLOT_ANCHORS,
    smg: SMG_STICKER_SLOT_ANCHORS,
    rifle: RIFLE_STICKER_SLOT_ANCHORS,
    sniper: SNIPER_STICKER_SLOT_ANCHORS,
    shotgun: SHOTGUN_STICKER_SLOT_ANCHORS,
    mg: MG_STICKER_SLOT_ANCHORS,
  };

  const WEAPON_STICKER_SLOT_ANCHORS = {
    "Glock-18": PISTOL_STICKER_SLOT_ANCHORS,
    "P2000": PISTOL_STICKER_SLOT_ANCHORS,
    "Tec-9": PISTOL_STICKER_SLOT_ANCHORS,
    "Five-SeveN": PISTOL_STICKER_SLOT_ANCHORS,
    "CZ75-Auto": PISTOL_STICKER_SLOT_ANCHORS,
    "Desert Eagle": PISTOL_STICKER_SLOT_ANCHORS,
    "R8 Revolver": [
      [-0.18, 0.04, 0.18],
      [-0.02, 0.02, 0.22],
      [0.24, 0.03, 0.18],
      [0.10, -0.20, 0.12],
      [-0.28, 0.02, 0.14],
    ],
    "USP-S": [
      [-0.34, 0.04, 0.18],
      [-0.28, 0.06, 0.20],
      [-0.04, 0.03, 0.22],
      [0.18, 0.04, 0.20],
      [-0.08, -0.24, 0.10],
    ],
    "P250": [
      [-0.30, 0.06, 0.20],
      [-0.04, 0.03, 0.22],
      [0.22, 0.04, 0.20],
      [-0.08, -0.24, 0.10],
      [0.32, 0.01, 0.16],
    ],
  };

  function resolveStickerSlotAnchor(weaponName, slotIndex, center, size, three, options = {}) {
    const weaponClass = resolveWeaponStickerClass(weaponName);
    const preset = WEAPON_STICKER_SLOT_ANCHORS[weaponName]
      || WEAPON_CLASS_STICKER_SLOT_ANCHORS[weaponClass]
      || null;

    if (preset && preset[slotIndex]) {
      const [relX, relY, relZ] = preset[slotIndex];
      return new three.Vector3(
        center.x + size.x * relX,
        center.y + size.y * relY,
        center.z + size.z * relZ
      );
    }

    const isKnifeModel = Boolean(options.isKnifeModel);
    const slotSpread = weaponClass === "smg" ? 0.82 : 0.62;
    const t = (slotIndex + 0.5) / 5;
    return new three.Vector3(
      center.x + size.x * (t - 0.5) * (isKnifeModel ? 0.55 : slotSpread),
      center.y + size.y * (weaponClass === "pistol" ? 0.05 : isKnifeModel ? 0.18 : 0.08),
      center.z + size.z * (weaponClass === "pistol" ? 0.14 : isKnifeModel ? 0.55 : 0.18)
    );
  }

  function resolveWeaponNameFromTitle(itemTitle) {
    let part = String(itemTitle || "").trim();
    part = part.replace(/^★\s*/u, "");
    part = part.replace(/^(StatTrak™|Souvenir)\s+/iu, "");
    return part.split("|")[0].trim();
  }

  function resolveWeaponStickerClass(weaponName) {
    return WEAPON_STICKER_CLASS[weaponName] || "default";
  }

  function computeBaseStickerSize(size, maxDimension, options = {}) {
    const bodyReference = Math.max(
      size.y * 0.95,
      Math.min(size.x, size.z) * 0.75,
      maxDimension * 0.28
    );
    const knifeScale = options.isKnifeModel ? 0.72 : 1;
    return Math.max(bodyReference * 0.24, size.y * 0.16) * knifeScale;
  }

  // Glock-18 Wasteland Rebel reference: dog-tag hang length ≈ 16% of weapon bbox
  // height. Compact pistols hit the 0.032 floor; long guns must not inherit barrel
  // length via maxDimension (that inflated AUG/AWP charms to magazine size).
  const CHARM_WEAPON_HEIGHT_RATIO = 0.16;
  const CHARM_WEAPON_MIN_SIZE = 0.032;

  function computeCraftCharmSize(size) {
    const bodyHeight = Math.max(size.y, 0.001);
    return Math.max(bodyHeight * CHARM_WEAPON_HEIGHT_RATIO, CHARM_WEAPON_MIN_SIZE);
  }

  function resolveStickerSizeForSlot(baseSize, weaponName, slotIndex, options = {}) {
    if (options.isKnifeModel) {
      return baseSize * WEAPON_STICKER_CLASS_SCALE.knife;
    }
    const weaponClass = resolveWeaponStickerClass(weaponName);
    const classScale = WEAPON_STICKER_CLASS_SCALE[weaponClass] ?? WEAPON_STICKER_CLASS_SCALE.default;
    const slotScales = WEAPON_STICKER_SLOT_SCALE[weaponName];
    const slotScale = slotScales?.[slotIndex] ?? 1;
    return baseSize * classScale * slotScale * CRAFT_STICKER_SIZE_MULTIPLIER;
  }

  function computeStickerSurfaceOffset(side, modelRoot, three) {
    let modelSpan = 1;
    if (modelRoot && three) {
      const bounds = computeViewerBounds(modelRoot, three, {});
      modelSpan = Math.max(bounds.getSize(new three.Vector3()).length(), 1e-4);
    }
    // Keep stickers on the paint — too little offset buries them in the gun mesh.
    return Math.max(modelSpan * 0.0007, side * 0.022, 0.0009);
  }

  function shouldPreferStickerPlane(_options = {}) {
    return typeof window.THREE?.DecalGeometry !== "function";
  }

  function buildStickerSurfaceBasis(normalWorld, worldPoint, camera, three) {
    const normal = ensureOutwardNormal(normalWorld.clone(), worldPoint, camera, three);
    const worldUp = new three.Vector3(0, 1, 0);
    let tangent = new three.Vector3().crossVectors(worldUp, normal);
    if (tangent.lengthSq() < 1e-5) {
      tangent = new three.Vector3(1, 0, 0).cross(normal);
    }
    tangent.normalize();
    const bitangent = new three.Vector3().crossVectors(normal, tangent).normalize();
    return { normal, tangent, bitangent };
  }

  function collectStickerLayerHits(meshes, worldPoint, normalWorld, side, three, camera) {
    if (!meshes.length) return [];

    const basis = buildStickerSurfaceBasis(normalWorld, worldPoint, camera, three);
    const half = side * 0.46;
    const sampleScales = [-0.42, -0.14, 0.14, 0.42];
    const raycaster = new three.Raycaster();
    const inward = basis.normal.clone().negate();
    const probeLift = Math.max(side * 0.16, 0.004);
    const rayDepth = probeLift * 2 + Math.max(side * 0.36, 0.018);
    const seen = new Map();

    prepareCraftRaycastMeshes(meshes);

    const registerHit = (candidate) => {
      if (!candidate?.object) return;
      const existing = seen.get(candidate.object.uuid);
      if (!existing || candidate.distance < existing.distance) {
        seen.set(candidate.object.uuid, candidate);
      }
    };

    sampleScales.forEach((uScale) => {
      sampleScales.forEach((vScale) => {
        const samplePoint = worldPoint.clone()
          .addScaledVector(basis.tangent, half * uScale)
          .addScaledVector(basis.bitangent, half * vScale);
        raycaster.set(
          samplePoint.clone().addScaledVector(basis.normal, probeLift),
          inward
        );
        raycaster.far = rayDepth;
        raycaster.near = 0;
        raycaster.intersectObjects(meshes, false).forEach(registerHit);
      });
    });

    raycaster.set(
      worldPoint.clone().addScaledVector(basis.normal, probeLift),
      inward
    );
    raycaster.far = rayDepth;
    raycaster.near = 0;
    raycaster.intersectObjects(meshes, false).forEach(registerHit);

    return Array.from(seen.values()).sort((left, right) => left.distance - right.distance);
  }

  function createStickerSurfaceMaterial(texture, scrapeWear, options, three) {
    texture.flipY = true;
    return new three.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      opacity: Math.max(0.25, options.isPreview ? 0.96 - scrapeWear * 0.72 : 0.98 - scrapeWear * 0.72),
      side: three.FrontSide,
    });
  }

  function attachStickerPlaneOnHit(modelRoot, layerHit, texture, side, three, slotIndex, options, scrapeWear, rotationDegrees = 0) {
    const target = layerHit.object;
    const worldPoint = layerHit.point.clone();
    let normalWorld = worldNormalFromHit(layerHit, three);
    normalWorld = ensureOutwardNormal(normalWorld, worldPoint, options.camera || null, three);
    const surfaceOffset = computeStickerSurfaceOffset(side, modelRoot, three);
    const anchoredWorld = worldPoint.clone().addScaledVector(normalWorld, surfaceOffset);
    const localPoint = anchoredWorld.clone();
    target.worldToLocal(localPoint);

    const material = createStickerSurfaceMaterial(texture, scrapeWear, options, three);
    const mesh = new three.Mesh(new three.PlaneGeometry(side, side), material);
    mesh.position.copy(localPoint);
    const quaternion = buildStickerQuaternionFromWorldNormal(
      normalWorld,
      target,
      three,
      options.camera || null,
      worldPoint
    );
    if (rotationDegrees) {
      quaternion.multiply(new three.Quaternion().setFromAxisAngle(
        new three.Vector3(0, 0, 1),
        three.MathUtils.degToRad(rotationDegrees)
      ));
    }
    mesh.quaternion.copy(quaternion);
    mesh.renderOrder = 30;
    mesh.userData = options.isPreview
      ? { craftPreview: "sticker", slotIndex, wear: scrapeWear }
      : { craftAttachment: "sticker", slotIndex, wear: scrapeWear };
    target.add(mesh);
    return mesh;
  }

  function attachStickerDecalLayers(modelRoot, targets, decalPosition, decalOrientation, decalSize, texture, scrapeWear, options, slotIndex, three) {
    if (isCraftAttachStale(modelRoot, options)) return null;
    const inverseRoot = new three.Matrix4().copy(modelRoot.matrixWorld).invert();
    const material = createStickerSurfaceMaterial(texture, scrapeWear, options, three);
    const decalMeshes = [];

    targets.forEach((target) => {
      let decalGeometry = null;
      try {
        decalGeometry = new three.DecalGeometry(target, decalPosition, decalOrientation, decalSize);
      } catch (_error) {
        decalGeometry = null;
      }

      const vertexCount = decalGeometry?.attributes?.position?.count || 0;
      if (!decalGeometry || vertexCount < 3) {
        decalGeometry?.dispose?.();
        return;
      }

      decalGeometry.applyMatrix4(inverseRoot);
      const mesh = new three.Mesh(decalGeometry, material);
      mesh.renderOrder = 30;
      mesh.userData.craftPart = true;
      decalMeshes.push(mesh);
    });

    if (!decalMeshes.length) return null;

    const group = new three.Group();
    group.userData = options.isPreview
      ? { craftPreview: "sticker", slotIndex, wear: scrapeWear }
      : { craftAttachment: "sticker", slotIndex, wear: scrapeWear };
    decalMeshes.forEach((mesh) => group.add(mesh));
    modelRoot.add(group);
    return group;
  }

  function parseSkinportSlug(slug) {
    let raw = String(slug || "").trim().toLowerCase().replace(/^csgo-/, "");
    raw = raw.replace(/-stattrak(?:-tm)?$/i, "").replace(/^stattrak-/, "");
    raw = raw.replace(/-\d+$/, "");

    let wear = "";
    for (const [wearSlug, wearLabel] of Object.entries(WEAR_SLUGS)) {
      const suffix = `-${wearSlug}`;
      if (raw.endsWith(suffix)) {
        wear = wearLabel;
        raw = raw.slice(0, -suffix.length);
        break;
      }
    }

    for (const [prefix, weaponLabel] of SKINPORT_WEAPON_PREFIXES) {
      const token = `${prefix}-`;
      if (raw === prefix) {
        return { baseName: weaponLabel, wear, query: weaponLabel };
      }
      if (raw.startsWith(token)) {
        const skinSlug = raw.slice(token.length);
        if (!skinSlug) return { baseName: weaponLabel, wear, query: weaponLabel };
        const skinLabel = skinSlug
          .split("-")
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ")
          .replace(/\bNeo Noir\b/i, "Neo-Noir")
          .replace(/\bPrint Stream\b/i, "Printstream")
          .replace(/\bBlue Phosphor\b/i, "Blue Phosphor");
        const baseName = `${weaponLabel} | ${skinLabel}`;
        return {
          baseName,
          wear,
          query: baseName,
          marketHashName: wear ? `${baseName} (${wear})` : baseName,
        };
      }
    }

    const guess = slugToMarketName(slug);
    const [baseName, parsedWear] = splitSteamWearName(guess);
    return {
      baseName,
      wear: wear || parsedWear,
      query: baseName || guess,
      marketHashName: wear || parsedWear ? `${baseName} (${wear || parsedWear})` : guess,
    };
  }

  function parseSkinLink(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;

    try {
      const url = /^https?:\/\//i.test(raw)
        ? new URL(raw)
        : raw.includes("?") || raw.includes("=")
          ? new URL(raw, window.location.origin)
          : null;

      if (url) {
        const fromQuery = url.searchParams.get("market_hash_name")
          || url.searchParams.get("lookup_name")
          || url.searchParams.get("skin")
          || url.searchParams.get("link");
        if (fromQuery) {
          const decoded = decodeURIComponent(fromQuery);
          const nested = parseSkinLink(decoded);
          if (nested) return nested;
        }

        if (url.hostname.includes("steamcommunity.com") && url.pathname.includes("/market/listings/730/")) {
          const segment = decodeURIComponent(url.pathname.split("/730/")[1] || "").replace(/\/+$/, "");
          if (segment) {
            const [baseName, wear] = splitSteamWearName(segment);
            return { marketHashName: segment, baseName, wear, query: baseName };
          }
        }

        if (url.hostname.includes("skinport.com")) {
          const search = url.searchParams.get("search");
          if (search) return parseSkinLink(search);
          const pathParts = url.pathname.split("/").filter(Boolean);
          const itemIdx = pathParts.indexOf("item");
          if (itemIdx >= 0 && pathParts[itemIdx + 1]) {
            const slug = pathParts[itemIdx + 1];
            const parsedSlug = parseSkinportSlug(slug.replace(/^csgo-?/i, ""));
            if (parsedSlug?.baseName?.includes("|") || parsedSlug?.query) {
              return parsedSlug;
            }
          }
        }

        if (url.hostname.includes("csfloat.com") || url.hostname.includes("buff.163")) {
          const search = url.searchParams.get("search") || url.searchParams.get("q") || url.searchParams.get("name");
          if (search) return parseSkinLink(search);
        }
      }
    } catch (_error) {
      /* fall through to plain name */
    }

    const cleaned = raw.replace(/^★\s*/u, "★ ").trim();
    const [baseName, wear] = splitSteamWearName(cleaned);
    const hasWear = Boolean(wear);
    return {
      marketHashName: hasWear ? `${baseName} (${wear})` : cleaned,
      baseName: baseName || cleaned,
      wear: wear || "",
      query: baseName || cleaned,
    };
  }

  function itemHasWearVariants(item) {
    const title = String(item?.display_name || item?.market_hash_name || "").trim();
    if (!title.includes("|")) return false;
    if (/\bcase\b/i.test(title)) return false;
    const typeHint = String(item?.category || item?.type_note || "").toLowerCase();
    if (/(cases|stickers|capsules|patches|music|collectibles|agents|tools|graffiti|pins)/i.test(typeHint)) return false;
    return true;
  }

  async function resolveCatalogItem(parsed) {
    const query = String(parsed?.query || parsed?.baseName || parsed?.marketHashName || "").trim();
    if (!query) return null;

    const response = await fetch(`search_items.php?q=${encodeURIComponent(query)}&limit=12`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Catalog lookup failed (${response.status})`);
    const json = await response.json();
    const rows = Array.isArray(json?.items) ? json.items : [];
    const target = normalizeMarketName(parsed.marketHashName);
    const exact = rows.find((row) => normalizeMarketName(row.market_hash_name) === target)
      || rows.find((row) => normalizeMarketName(row.display_name) === normalizeMarketName(parsed.baseName))
      || rows[0]
      || null;
    return exact;
  }

  async function resolveSkinModelMeta(names) {
    const manifestTargets = [
      "assets/models/skins/manifest.json",
      "assets/models/agents/manifest.json",
    ];
    const payloads = await Promise.all(
      manifestTargets.map((manifestUrl) => fetch(`${manifestUrl}?v=${encodeURIComponent(String(names[0] || ""))}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null))
    );
    const entries = payloads.flatMap((payload) => normalizeModelManifestEntries(payload));
    return resolveManifestModelEntry(entries, names);
  }

  function disposeViewerMaterials(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach(disposeViewerMaterials);
      return;
    }
    Object.values(material).forEach((value) => {
      if (value && typeof value === "object" && typeof value.dispose === "function") value.dispose();
    });
    if (typeof material.dispose === "function") material.dispose();
  }

  // Enough samples to pin the silhouette without walking every vertex; bounds
  // are computed a handful of times per model load, not per frame.
  const SKINNED_BOUNDS_SAMPLES = 1400;

  /**
   * Posed-vertex bounds for a skinned mesh.
   *
   * A BufferGeometry's boundingBox describes the BIND pose, and three.js never
   * refreshes it for skinning — the deformation happens on the GPU. The crafter
   * poses weapons with an inventory_inspect clip *before* framing, so measuring
   * the bind box means the camera fits a shape that is not the one on screen:
   * the gun lands off-centre and its stock clips off the edge. Sampling through
   * boneTransform() measures what is actually drawn.
   */
  function expandBoundsWithSkinnedMesh(bounds, child, three, hasBounds) {
    const position = child.geometry?.attributes?.position;
    if (!position || typeof child.boneTransform !== "function") return hasBounds;
    if (!child.skeleton?.bones?.length) return hasBounds;
    const step = Math.max(1, Math.floor(position.count / SKINNED_BOUNDS_SAMPLES));
    const point = new three.Vector3();
    let seeded = hasBounds;
    for (let i = 0; i < position.count; i += step) {
      child.boneTransform(i, point);
      point.applyMatrix4(child.matrixWorld);
      if (!seeded) {
        bounds.min.copy(point);
        bounds.max.copy(point);
        seeded = true;
      } else {
        bounds.expandByPoint(point);
      }
    }
    return seeded;
  }

  function computeRenderableBounds(object, three) {
    const bounds = new three.Box3();
    const tempBounds = new three.Box3();
    let hasBounds = false;
    // boneTransform reads bone.matrixWorld, so the graph must be up to date.
    object.updateMatrixWorld(true);
    object.traverse((child) => {
      if (!isViewerBoundsMesh(child)) return;
      if (child.isSkinnedMesh) {
        hasBounds = expandBoundsWithSkinnedMesh(bounds, child, three, hasBounds);
        return;
      }
      if (!child.geometry.boundingBox && typeof child.geometry.computeBoundingBox === "function") {
        child.geometry.computeBoundingBox();
      }
      if (!child.geometry.boundingBox) return;
      tempBounds.copy(child.geometry.boundingBox);
      tempBounds.applyMatrix4(child.matrixWorld);
      if (!hasBounds) {
        bounds.copy(tempBounds);
        hasBounds = true;
      } else {
        bounds.union(tempBounds);
      }
    });
    return hasBounds ? bounds : new three.Box3().setFromObject(object);
  }

  function computeSkeletonBounds(object, three) {
    const bounds = new three.Box3();
    const point = new three.Vector3();
    let hasPoints = false;
    object.updateMatrixWorld(true);
    object.traverse((child) => {
      if (!child?.isBone) return;
      child.getWorldPosition(point);
      if (!hasPoints) {
        bounds.min.copy(point);
        bounds.max.copy(point);
        hasPoints = true;
      } else {
        bounds.expandByPoint(point);
      }
    });
    if (!hasPoints) return null;
    bounds.min.x -= 0.32;
    bounds.max.x += 0.32;
    bounds.min.z -= 0.22;
    bounds.max.z += 0.22;
    bounds.min.y -= 0.12;
    bounds.max.y += 0.18;
    return bounds;
  }

  function computeViewerBounds(object, three, options = {}) {
    if (options.isAgentModel) {
      const skeletonBounds = computeSkeletonBounds(object, three);
      if (skeletonBounds) return skeletonBounds;
    }
    return computeRenderableBounds(object, three);
  }

  function normalizeViewerModelScale(object, three, options = {}) {
    if (!object) return;
    const bounds = computeViewerBounds(object, three, options);
    const size = bounds.getSize(new three.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z) || 0;
    if (!options.isAgentModel || maxDimension <= 0 || maxDimension >= 0.3) return;
    const upscaleFactor = 1.74 / Math.max(size.y, maxDimension, 0.001);
    object.scale.multiplyScalar(upscaleFactor);
    object.updateMatrixWorld(true);
  }

  // Cache-busting "?v=..." query tags get stamped across whole asset batches
  // (e.g. "?v=20260912-ak47-finished-1" on every crafter model, not just the
  // AK-47's), so weapon-name matching must ignore the query string or it
  // false-positives on unrelated models that merely share a deploy tag.
  function stripUrlQuery(url) {
    return String(url || "").split("?")[0];
  }

  function isSsg08ViewerItem(itemTitle, modelUrl) {
    const hay = `${itemTitle || ""} ${stripUrlQuery(modelUrl)}`.toLowerCase();
    return /ssg[\s_-]?08|weapon_snip_ssg08|weapon_ssg08/.test(hay);
  }

  function isAk47ViewerItem(itemTitle, modelUrl) {
    const hay = `${itemTitle || ""} ${stripUrlQuery(modelUrl)}`.toLowerCase();
    return /ak[\s_-]?47|weapon_rif_ak47|weapon_ak47/.test(hay);
  }

  function applyWeaponInspectPose(modelRoot, three, options = {}) {
    if (!modelRoot || !three) return;
    // SSG 08 leaves normalizeGunPresentation 180° from AWP/AUG inspect.
    // World-Y yaw alone put stock left / barrel right but left the scope hanging
    // under the receiver. Roll π around the barrel (world X) to put the scope on top.
    if (isSsg08ViewerItem(options.itemTitle, options.modelUrl)) {
      modelRoot.rotateOnWorldAxis(new three.Vector3(0, 1, 0), Math.PI);
      modelRoot.rotateOnWorldAxis(new three.Vector3(1, 0, 0), Math.PI);
    } else if (isAk47ViewerItem(options.itemTitle, options.modelUrl)) {
      // AK-47 baked/base GLBs leave normalize with stock left / muzzle right.
      // Yaw π so the barrel matches M4A1-S and other rifles (muzzle screen-left).
      modelRoot.rotateOnWorldAxis(new three.Vector3(0, 1, 0), Math.PI);
    }
    // Slight barrel-up tilt for standing side profile (after normalizeGunPresentation).
    modelRoot.rotateOnWorldAxis(new three.Vector3(1, 0, 0), -0.04);
    modelRoot.updateMatrixWorld(true);
  }

  function collectStickerRaycastMeshes(modelRoot) {
    const bodyHd = [];
    const bodyOther = [];
    modelRoot.traverse((child) => {
      if (!child?.isMesh || !child.visible || child.userData?.viewerHand || child.userData?.craftAttachment || isUnderCraftAttachment(child)) return;
      const name = String(child.name || "").toLowerCase();
      if (isLegacyViewerMesh(child)) return;
      if (name.includes("body_hd")) {
        bodyHd.push(child);
      } else if (/body_legacy|^body$|_body\b|weapon_body|gun_body/.test(name)) {
        bodyOther.push(child);
      }
    });
    if (bodyHd.length) {
      return bodyHd;
    }
    if (bodyOther.length) {
      return bodyOther;
    }
    const preferred = [];
    modelRoot.traverse((child) => {
      if (!child?.isMesh || !child.visible || child.userData?.viewerHand || child.userData?.craftAttachment || isUnderCraftAttachment(child)) return;
      const name = String(child.name || "").toLowerCase();
      if (isLegacyViewerMesh(child)) return;
      if (/body_hd|body_legacy|^body$|_body\b|weapon_body|gun_body/.test(name)) {
        preferred.push(child);
      }
    });
    if (preferred.length) {
      return preferred;
    }
    const paintMeshes = collectSkinPaintMeshes(modelRoot);
    return paintMeshes.length ? paintMeshes : collectCraftRaycastMeshes(modelRoot);
  }

  function raycastCraftSurfaceFromClient(renderer, camera, modelRoot, clientX, clientY, three, options = {}) {
    if (!renderer?.domElement || !camera || !modelRoot || !three) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const mouse = new three.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new three.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const kind = String(options.kind || "sticker");
    // Charms/slabs need the full gun surface; sticker body filters are too sparse on showcase GLBs.
    let meshes = collectMeshesForCraftKind(modelRoot, kind);
    if (!meshes.length) {
      meshes = collectCraftRaycastMeshes(modelRoot);
    }
    if (!meshes.length) return null;
    prepareCraftRaycastMeshes(meshes);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const hit = hits[0];
    let normal = ensureOutwardNormal(worldNormalFromHit(hit, three), hit.point, camera, three);
    // Charms/slabs hang under the gun — keep attach normal camera-horizontal so moving
    // the cursor up the slide does not pull the keychain toward the lens.
    if (kind === "charm" || kind === "slab") {
      normal = flattenCharmAttachNormal(normal, hit.point, camera, three);
    }
    // Store in model-local space so float/bob cannot drift stickers after place/sync.
    modelRoot.updateMatrixWorld(true);
    const localPoint = hit.point.clone();
    modelRoot.worldToLocal(localPoint);
    const localNormal = normal.clone()
      .transformDirection(new three.Matrix4().copy(modelRoot.matrixWorld).invert())
      .normalize();
    return {
      point: [localPoint.x, localPoint.y, localPoint.z],
      normal: [localNormal.x, localNormal.y, localNormal.z],
      meshUuid: hit.object?.uuid || "",
      space: "model",
      // Slot is assigned later — inspect offsets must be computed relative to that slot.
    };
  }

  function attachViewerHands(modelRoot, three) {
    if (!modelRoot || !three) return null;

    const existing = modelRoot.getObjectByName("viewer_hands");
    if (existing) {
      existing.parent?.remove(existing);
      existing.traverse((child) => {
        if (child.geometry?.dispose) child.geometry.dispose();
        if (child.material?.dispose) child.material.dispose();
      });
    }

    const bounds = computeViewerBounds(modelRoot, three, {});
    const center = bounds.getCenter(new three.Vector3());
    const size = bounds.getSize(new three.Vector3());
    const handGroup = new three.Group();
    handGroup.name = "viewer_hands";
    handGroup.userData = { craftAttachment: true, viewerHand: true };

    const skinMat = new three.MeshStandardMaterial({
      color: 0xc49a6c,
      roughness: 0.74,
      metalness: 0.02,
    });
    const sleeveMat = new three.MeshStandardMaterial({
      color: 0x2a3142,
      roughness: 0.86,
      metalness: 0.04,
    });
    const gloveMat = new three.MeshStandardMaterial({
      color: 0x1f2430,
      roughness: 0.9,
      metalness: 0.03,
    });

    const scale = Math.max(size.x, size.y, size.z, 0.001);
    const forearmRadius = scale * 0.018;
    const forearmLength = scale * 0.16;
    const palmWidth = scale * 0.05;
    const palmHeight = scale * 0.07;
    const palmDepth = scale * 0.028;

    const buildHand = (side) => {
      const sign = side === "right" ? -1 : 1;
      const grip = new three.Group();
      const gripX = center.x + sign * size.x * 0.1;
      const gripY = center.y - size.y * 0.22;
      // Sit hands outside the receiver so they do not clip through the gun body.
      const gripZ = center.z - size.z * 0.14;
      grip.position.set(gripX, gripY, gripZ);

      const forearm = new three.Mesh(
        new three.CylinderGeometry(forearmRadius, forearmRadius * 0.92, forearmLength, 10, 1),
        side === "right" ? sleeveMat : gloveMat
      );
      forearm.position.set(sign * scale * 0.06, -scale * 0.08, -scale * 0.03);
      forearm.rotation.set(0.35, sign * 0.42, sign * 0.55);

      const palm = new three.Mesh(
        new three.BoxGeometry(palmWidth, palmHeight, palmDepth),
        skinMat
      );
      palm.position.set(sign * scale * 0.015, scale * 0.01, scale * 0.01);
      palm.rotation.set(0.2, sign * 0.18, sign * 0.35);

      const fingers = new three.Mesh(
        new three.BoxGeometry(palmWidth * 0.9, palmHeight * 0.45, palmDepth * 0.85),
        skinMat
      );
      fingers.position.set(sign * scale * 0.015, scale * 0.05, scale * 0.03);
      fingers.rotation.copy(palm.rotation);

      grip.add(forearm, palm, fingers);
      return grip;
    };

    handGroup.add(buildHand("right"), buildHand("left"));
    modelRoot.add(handGroup);
    return handGroup;
  }

  function resolvePreferredSkinModelUrl(itemTitle, skinModelUrl) {
    const url = String(skinModelUrl || "").trim();
    if (url && !isUnpaintedBaseModelUrl(url)) return url;
    const baked = resolveCrafterBakedModelUrl(crafterBatchLibrary, itemTitle);
    if (baked) return baked;
    if (url) return url;
    return resolveLocalModelUrl(itemTitle);
  }

  function hideCrafterPreviewMeshes(modelRoot) {
    if (!modelRoot) return;
    const helperPattern = /(?:^|_)(cube|sphere|icosphere|icosphere\d*|plane|cylinder|cone|torus|empty|preview|motif|pattern|swatch|helper|ref)(?:_|$|\d)/i;
    const motifPattern = /motiv|skin.?preview|palette|thumbnail|default_generated/i;
    modelRoot.traverse((child) => {
      const name = String(child?.name || "");
      const lower = name.toLowerCase();
      if (helperPattern.test(name) || motifPattern.test(lower)) {
        child.visible = false;
      }
    });
  }

  const SHOTGUN_SHELL_MESH_RE = /(?:^|[\/_.-])(?:(?:shotgun[_-]?)?shells?|ammo|cartridges?|12[\s_-]?gauge|(?:nova|xm1014)[_-]?bullet)(?:[\/_.-]|$|\d)/i;
  const XM1014_SHELL_AABB_METERS = {
    min: [-0.03, -0.16, -0.28],
    max: [0.15, -0.1, -0.18],
  };
  const XM1014_SHELL_AABB_SOURCE = {
    min: [-10.3, -0.55, -5.8],
    max: [-8, 5.15, -4.75],
  };

  function isXm1014ViewerItem(itemTitle, modelUrl) {
    return /xm1014/i.test(String(itemTitle || "")) || /xm1014/i.test(String(modelUrl || ""));
  }

  function isShotgunShellViewerItem(itemTitle, modelUrl) {
    const hay = `${itemTitle || ""} ${modelUrl || ""}`;
    return /xm1014|nova|mag-?7|sawed-?off/i.test(hay);
  }

  function shotgunMaterialKey(name) {
    return String(name || "").toLowerCase().replace(/\.\d+$/, "");
  }

  function isXm1014SplitShellMaterialName(name) {
    return shotgunMaterialKey(name) === "weapon_shot_xm1014";
  }

  function isXm1014GunSplitMaterialName(name) {
    return shotgunMaterialKey(name) === "shot_xm1014";
  }

  function isDedicatedShotgunShellMaterialName(name) {
    const key = shotgunMaterialKey(name);
    if (key === "nova_bullet" || key === "xm1014_bullet") return true;
    return /(?:^|[_.-])(?:(?:shotgun[_-]?)?shells?|ammo|cartridges?|12[\s_-]?gauge|bullet)(?:[_.-]|$)/i.test(key);
  }

  function stripMeshTrianglesInAabb(mesh, min, max, three) {
    const geometry = mesh?.geometry;
    const pos = geometry?.getAttribute?.("position");
    if (!pos) return false;
    const inside = (index) => {
      const x = pos.getX(index);
      const y = pos.getY(index);
      const z = pos.getZ(index);
      return x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1] && z >= min[2] && z <= max[2];
    };
    const src = geometry.index?.array;
    const keep = [];
    const total = src ? src.length : pos.count;
    if (src) {
      for (let i = 0; i + 2 < src.length; i += 3) {
        const a = src[i];
        const b = src[i + 1];
        const c = src[i + 2];
        if (inside(a) && inside(b) && inside(c)) continue;
        keep.push(a, b, c);
      }
    } else {
      for (let i = 0; i + 2 < pos.count; i += 3) {
        if (inside(i) && inside(i + 1) && inside(i + 2)) continue;
        keep.push(i, i + 1, i + 2);
      }
    }
    if (keep.length === total) return false;
    if (keep.length < 3) {
      mesh.visible = false;
      return true;
    }
    const IndexArray = keep.length > 65535 ? Uint32Array : Uint16Array;
    const BufferAttributeCtor = three?.BufferAttribute || window.THREE?.BufferAttribute;
    geometry.setIndex(
      BufferAttributeCtor ? new BufferAttributeCtor(new IndexArray(keep), 1) : new IndexArray(keep)
    );
    geometry.computeBoundingBox?.();
    geometry.computeBoundingSphere?.();
    return true;
  }

  function shotgunMeshMaterials(child) {
    if (!child?.material) return [];
    return Array.isArray(child.material) ? child.material : [child.material];
  }

  function hideShotgunShellMaterialSlot(child, index, three) {
    const mats = shotgunMeshMaterials(child);
    const mat = mats[index];
    if (!mat) return;
    const hidden = (mat.clone && three)
      ? mat.clone()
      : mat;
    hidden.visible = false;
    hidden.transparent = true;
    hidden.opacity = 0;
    hidden.depthWrite = false;
    if ("colorWrite" in hidden) hidden.colorWrite = false;
    hidden.name = `${String(mat.name || "shell")}__hidden`;
    if (Array.isArray(child.material)) {
      const next = child.material.slice();
      next[index] = hidden;
      child.material = next;
    } else {
      child.material = hidden;
    }
    const groups = child.geometry?.groups;
    if (Array.isArray(groups) && groups.length) {
      child.geometry.groups = groups.filter((group) => Number(group?.materialIndex) !== index);
    }
  }

  function hideShotgunShellMeshes(modelRoot, three, options = {}) {
    if (!modelRoot) return { hidden: 0 };
    const itemTitle = options.itemTitle || "";
    const modelUrl = options.modelUrl || "";
    const looksXm = isXm1014ViewerItem(itemTitle, modelUrl);
    const splitParents = new Set();
    modelRoot.traverse((child) => {
      if ((!child?.isMesh && !child?.isSkinnedMesh) || child.visible === false || !child.parent) return;
      let hasGun = false;
      let hasShell = false;
      shotgunMeshMaterials(child).forEach((mat) => {
        if (isXm1014GunSplitMaterialName(mat?.name)) hasGun = true;
        if (isXm1014SplitShellMaterialName(mat?.name) || isDedicatedShotgunShellMaterialName(mat?.name)) hasShell = true;
      });
      (child.parent.children || []).forEach((sibling) => {
        if ((!sibling?.isMesh && !sibling?.isSkinnedMesh) || sibling.visible === false) return;
        shotgunMeshMaterials(sibling).forEach((mat) => {
          if (isXm1014GunSplitMaterialName(mat?.name)) hasGun = true;
          if (isXm1014SplitShellMaterialName(mat?.name) || isDedicatedShotgunShellMaterialName(mat?.name)) hasShell = true;
        });
      });
      if (hasGun && hasShell) splitParents.add(child.parent);
    });

    const box = three?.Box3 ? new three.Box3().setFromObject(modelRoot) : null;
    const size = box && three.Vector3 ? box.getSize(new three.Vector3()) : null;
    const maxDim = size ? Math.max(size.x, size.y, size.z) : 0;
    const aabb = maxDim > 5 ? XM1014_SHELL_AABB_SOURCE : XM1014_SHELL_AABB_METERS;
    let hidden = 0;

    modelRoot.traverse((child) => {
      if ((!child?.isMesh && !child?.isSkinnedMesh) || child.visible === false) return;
      if (SHOTGUN_SHELL_MESH_RE.test(String(child?.name || ""))) {
        child.visible = false;
        child.userData.xm1014ShellHidden = true;
        hidden += 1;
        return;
      }
      const mats = shotgunMeshMaterials(child);
      const splitContext = splitParents.has(child.parent)
        || mats.some((mat) => isXm1014GunSplitMaterialName(mat?.name));
      const shellIdx = [];
      const otherIdx = [];
      mats.forEach((mat, index) => {
        const dedicated = isDedicatedShotgunShellMaterialName(mat?.name);
        const xmSplit = splitContext && isXm1014SplitShellMaterialName(mat?.name);
        if (dedicated || xmSplit) shellIdx.push(index);
        else otherIdx.push(index);
      });
      if (shellIdx.length && otherIdx.length) {
        shellIdx.forEach((index) => hideShotgunShellMaterialSlot(child, index, three));
        child.userData.xm1014ShellHidden = true;
        hidden += 1;
        return;
      }
      if (shellIdx.length && !otherIdx.length && (splitContext || isDedicatedShotgunShellMaterialName(mats[0]?.name))) {
        child.visible = false;
        child.userData.xm1014ShellHidden = true;
        hidden += 1;
        return;
      }
      if (looksXm && stripMeshTrianglesInAabb(child, aabb.min, aabb.max, three)) {
        child.userData.xm1014ShellHidden = true;
        hidden += 1;
      }
    });

    const report = {
      source: options.source || "viewer",
      hidden,
      itemTitle,
      modelUrl,
    };
    modelRoot.userData.shotgunShellHide = report;
    try { window.__CS2_SHOTGUN_SHELL_HIDE__ = report; } catch (_error) { /* noop */ }
    return report;
  }

  function hideXm1014ShellMeshes(modelRoot, three, options) {
    return hideShotgunShellMeshes(modelRoot, three, options);
  }

  function stickerPlacementFromEntry(entry) {
    const placement = entry?.placement;
    if (!placement || !Array.isArray(placement.point) || placement.point.length < 3) {
      return null;
    }
    return placement;
  }

  function stickerRotationFromEntry(entry) {
    const rotation = Number(entry?.placement?.rotation);
    return Number.isFinite(rotation) ? rotation : 0;
  }

  function charmPlacementFromEntry(entry) {
    return stickerPlacementFromEntry(entry);
  }

  function createCharmJigglePhysics(swayPivots, anchor, three, options = {}) {
    // The holding pin rides the gun rigidly — any pivot carrying it must stay out of
    // the sim, otherwise shaking the gun tilts the clasp off its attach point.
    const pivots = (swayPivots || []).filter((pivot) => pivot && !pivot.userData?.charmRigidPin);
    // Slabs / dog-tags hang quiet against the gun (CS2-style); figurines get more sway.
    const swayBoost = (Boolean(options.isSlab) || Boolean(options.isHighlightCharm))
      ? 0.45
      : (
        Boolean(options.isMissingLink)
        || Boolean(options.isGrenadeCharm)
        || Boolean(options.isGunCharm)
      ) ? 1.45 : 1;
    const state = {
      segments: pivots.map(() => ({ x: 0, z: 0, vx: 0, vz: 0 })),
      prevQuat: new three.Quaternion(),
      prevPos: new three.Vector3(),
      workQuat: new three.Quaternion(),
      deltaQuat: new three.Quaternion(),
      invPrev: new three.Quaternion(),
      axisScratch: new three.Vector3(),
      posScratch: new three.Vector3(),
      pendingImpulseX: 0,
      pendingImpulseZ: 0,
      initialized: false,
    };

    // Three r128 has no Quaternion.getAngle / Vector3.setFromQuaternion.
    const quatAngleAxis = (quat, axisOut) => {
      const w = Math.max(-1, Math.min(1, Number(quat.w) || 0));
      const angle = 2 * Math.acos(w);
      const sinHalf = Math.sqrt(Math.max(0, 1 - w * w));
      if (sinHalf > 1e-6) {
        axisOut.set(quat.x / sinHalf, quat.y / sinHalf, quat.z / sinHalf);
      } else {
        axisOut.set(1, 0, 0);
      }
      return angle;
    };

    return {
      // OrbitControls moves the camera, not the gun — inject relative spin from the viewer loop.
      addImpulse(x, z) {
        if (Number.isFinite(x)) state.pendingImpulseX += x;
        if (Number.isFinite(z)) state.pendingImpulseZ += z;
      },
      update(delta) {
        if (!anchor || !pivots.length) return;
        // Detached anchors must not keep simulating (avoids runaway sway after dispose races).
        if (!anchor.parent) return;

        // Pin/clasp rides the gun — never let leftover sim or a bad caller tilt it.
        const ringPivot = anchor.children[0];
        if (ringPivot?.userData?.charmRigidPin) {
          ringPivot.rotation.x = 0;
          ringPivot.rotation.z = 0;
        }

        const safeDelta = Math.min(0.033, Math.max(delta || 0, 1e-4));

        try {
          anchor.getWorldQuaternion(state.workQuat);
          anchor.getWorldPosition(state.posScratch);
        } catch (_error) {
          state.pendingImpulseX = 0;
          state.pendingImpulseZ = 0;
          return;
        }

        if (!state.initialized) {
          state.prevQuat.copy(state.workQuat);
          state.prevPos.copy(state.posScratch);
          state.pendingImpulseX = 0;
          state.pendingImpulseZ = 0;
          state.initialized = true;
          return;
        }

        state.invPrev.copy(state.prevQuat).invert();
        state.deltaQuat.copy(state.workQuat).multiply(state.invPrev);
        const rawAngle = quatAngleAxis(state.deltaQuat, state.axisScratch);
        const angle = Math.min(Number.isFinite(rawAngle) ? rawAngle : 0, 0.14);
        let impulseX = state.pendingImpulseX * 0.55;
        let impulseZ = state.pendingImpulseZ * 0.55;
        state.pendingImpulseX = 0;
        state.pendingImpulseZ = 0;
        if (angle > 1e-5) {
          impulseX += state.axisScratch.x * angle * 4.2;
          impulseZ += state.axisScratch.z * angle * 4.2;
        }

        const velX = (state.posScratch.x - state.prevPos.x) / safeDelta;
        const velY = (state.posScratch.y - state.prevPos.y) / safeDelta;
        const velZ = (state.posScratch.z - state.prevPos.z) / safeDelta;
        // Soft gun coupling — hang near the attach point instead of flinging.
        impulseX += velX * 0.18 + velY * 0.03;
        impulseZ += velZ * 0.18 + velY * 0.02;
        impulseX = Math.max(-1.8, Math.min(1.8, impulseX));
        impulseZ = Math.max(-1.8, Math.min(1.8, impulseZ));

        pivots.forEach((pivot, index) => {
          if (!pivot) return;
          const seg = state.segments[index];
          const weight = 1 + index * 0.18;
          seg.vx += impulseX * weight;
          seg.vz += impulseZ * weight;

          const spring = 38 - index * 2.5;
          const damp = 9.4 - index * 0.2;
          seg.vx += (-spring * seg.x - damp * seg.vx) * safeDelta;
          seg.vz += (-spring * seg.z - damp * seg.vz) * safeDelta;
          seg.x += seg.vx * safeDelta;
          seg.z += seg.vz * safeDelta;
          if (!Number.isFinite(seg.x) || !Number.isFinite(seg.z)) {
            seg.x = 0;
            seg.z = 0;
            seg.vx = 0;
            seg.vz = 0;
          }
          const maxSwing = (0.07 + index * 0.012) * swayBoost;
          seg.x = Math.max(-maxSwing, Math.min(maxSwing, seg.x));
          seg.z = Math.max(-maxSwing, Math.min(maxSwing, seg.z));

          pivot.rotation.x = seg.x;
          pivot.rotation.z = seg.z;
        });

        state.prevQuat.copy(state.workQuat);
        state.prevPos.copy(state.posScratch);
      },
    };
  }

  // Side profile like market cards: longest on X, height on Y, thin depth on Z.
  function scoreGunOrientation(size) {
    const dims = [size.x, size.y, size.z].sort((left, right) => right - left);
    const lenErr = Math.abs(size.x - dims[0]) / Math.max(dims[0], 0.001);
    const heightErr = Math.abs(size.y - dims[1]) / Math.max(dims[1], 0.001);
    const depthErr = Math.abs(size.z - dims[2]) / Math.max(dims[2], 0.001);
    let score = ((1 - Math.min(lenErr, 1)) * 3)
      + ((1 - Math.min(heightErr, 1)) * 2)
      + ((1 - Math.min(depthErr, 1)) * 1);
    // Reject vertical (barrel along Y) and flat table-top (length along Z).
    if (size.y > size.x * 1.08 && size.y >= size.z * 0.9) score -= 24;
    if (size.z > size.x * 1.08 && size.z >= size.y * 0.9) score -= 14;
    return score;
  }

  function isGunHorizontalSideProfile(size) {
    return size.x >= size.y * 0.72 && size.x >= size.z * 0.72;
  }

  /**
   * Per-weapon pose corrections, applied after normalizeGunPresentation() has
   * done its heuristic pass.
   *
   * That pass is pure geometry: it scores bounding-box proportions and
   * silhouette lobes to guess which way a gun faces. It gets ~30 of the 35
   * weapons right, but a few models defeat its assumptions — a belt-fed ammo
   * box reads as "stock", a revolver's cylinder mass reads as the muzzle end,
   * and for Dual Berettas the longest axis of the pair is the gap BETWEEN the
   * two pistols rather than either barrel, so it stands them upright.
   *
   * Each entry is the world-axis rotation that takes the heuristic's output to
   * the CS2 inventory pose: muzzle screen-left, grip/magazine down. Values were
   * measured by rendering every base weapon through the real normalizer and
   * comparing candidate corrections side by side — not guessed.
   */
  const WEAPON_POSE_CORRECTIONS = {
    // Ammo box lands above the receiver (the Negev, same layout, hangs correctly).
    m249: [["x", Math.PI]],
    // Mirrored: buttstock ends up screen-left, muzzle screen-right.
    negev: [["y", Math.PI]],
    // Mirrored: the cylinder/grip mass is mistaken for the muzzle end.
    revolver: [["y", Math.PI]],
    // Comes to rest on its side instead of in side profile.
    cz75a: [["x", Math.PI]],
    // Pair separation beats barrel length, so both pistols stand vertically.
    elite: [["z", Math.PI / 2], ["x", Math.PI / 2]],
    // Folding wire stock reads as a barrel, so the gun comes out mirrored.
    mp9: [["y", Math.PI]],
    // Folding stock again — lands stock-left / muzzle-right.
    galilar: [["y", Math.PI]],
    // Carry handle outweighs the magazine, so it settles magazine-up.
    m4a4: [["x", Math.PI]],
    // applyWeaponInspectPose already yaws+rolls the SSG; the yaw half is a
    // model-revision behind, leaving stock-left / muzzle-right. Yaw back.
    ssg08: [["y", Math.PI]],
  };

  // Matched on the item title first, then the model URL — so a skin-specific
  // GLB (skins/m249_nebula_crusader.glb) gets the same correction as its base.
  const WEAPON_POSE_CORRECTION_MATCHERS = [
    { key: "m249", title: /^\s*m249\b/i, url: /[\/]m249(?:[_.\/]|$)/i },
    { key: "negev", title: /^\s*negev\b/i, url: /[\/]negev(?:[_.\/]|$)/i },
    // Skin exports ship as "revoler_*.glb" (misspelt upstream) — match both.
    { key: "revolver", title: /^\s*r8\s+revolver\b/i, url: /[\/]revol(?:v)?er(?:[_.\/]|$)/i },
    { key: "cz75a", title: /^\s*cz75[-\s]?auto\b/i, url: /[\/]cz75a(?:[_.\/]|$)/i },
    { key: "elite", title: /^\s*dual\s+berettas\b/i, url: /[\/]elite(?:[_.\/]|$)/i },
    { key: "mp9", title: /^\s*mp9\b/i, url: /[\/]mp9(?:[_.\/]|$)/i },
    { key: "galilar", title: /^\s*galil(?:\s+ar)?\b/i, url: /[\/]galilar(?:[_.\/]|$)/i },
    // Anchored so it never catches M4A1-S (m4a1_silencer, m4blendmodel…).
    { key: "m4a4", title: /^\s*m4a4\b/i, url: /[\/]m4a4(?:[_.\/]|$)/i },
    { key: "ssg08", title: /^\s*ssg[-\s]?08\b/i, url: /[\/]ssg08(?:[_.\/]|$)/i },
  ];

  function weaponPoseCorrectionKey(options = {}) {
    const title = String(options.itemTitle || "").trim();
    const url = String(options.modelUrl || "").split("?")[0];
    for (const entry of WEAPON_POSE_CORRECTION_MATCHERS) {
      if (title && entry.title.test(title)) return entry.key;
      if (url && entry.url.test(url)) return entry.key;
    }
    return "";
  }

  /**
   * Applies the correction for this weapon, if it has one. Runs last so the
   * heuristic's own validity loop cannot undo it.
   *
   * @returns {string} the correction key applied, or "" when none matched.
   */
  function applyWeaponPoseCorrection(modelRoot, three, options = {}) {
    if (!modelRoot || !three) return "";
    const key = weaponPoseCorrectionKey(options);
    const ops = WEAPON_POSE_CORRECTIONS[key];
    if (!ops) return "";
    ops.forEach(([axis, angle]) => {
      modelRoot.rotateOnWorldAxis(
        new three.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0),
        angle
      );
    });
    modelRoot.updateMatrixWorld(true);
    return key;
  }

  // Upright side-profile candidates only — no ±π/2 pitch (table-top flat lie).
  const GUN_PRESENTATION_ROTATIONS = [
    [0, Math.PI, 0],
    [0, 0, 0],
    [0, Math.PI / 2, 0],
    [0, -Math.PI / 2, 0],
    [Math.PI, Math.PI, 0],
    [Math.PI, 0, 0],
    [0, Math.PI, Math.PI],
    [0, 0, Math.PI],
    [0, Math.PI, Math.PI / 2],
    [0, Math.PI, -Math.PI / 2],
    [0, 0, Math.PI / 2],
    [0, 0, -Math.PI / 2],
  ];

  function measureGunEndRadius(modelRoot, three, side) {
    if (!modelRoot || !three) return 0;
    modelRoot.updateMatrixWorld(true);
    const box = computeViewerBounds(modelRoot, three, {});
    if (box.isEmpty()) return 0;
    const size = box.getSize(new three.Vector3());
    if (size.x < 1e-4) return 0;
    const cy = (box.min.y + box.max.y) * 0.5;
    const cz = (box.min.z + box.max.z) * 0.5;
    const band = Math.max(size.x * 0.2, 0.01);
    const xMin = side === "left" ? box.min.x : box.max.x - band;
    const xMax = side === "left" ? box.min.x + band : box.max.x;
    const point = new three.Vector3();
    let sum = 0;
    let count = 0;

    modelRoot.traverse((node) => {
      if (!node?.isMesh || !node.geometry?.attributes?.position) return;
      if (node.userData?.viewerHand || node.userData?.craftAttachment) return;
      const pos = node.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 1800));
      for (let i = 0; i < pos.count; i += step) {
        point.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
        if (point.x < xMin || point.x > xMax) continue;
        sum += Math.hypot(point.y - cy, point.z - cz);
        count += 1;
      }
    });
    return count ? sum / count : 0;
  }

  function measureGripCluster(modelRoot, three) {
    modelRoot.updateMatrixWorld(true);
    const box = computeViewerBounds(modelRoot, three, {});
    if (box.isEmpty()) {
      return { reach: 0, x: 0, y: 0, below: 0, above: 0 };
    }
    const size = box.getSize(new three.Vector3());
    const cx = (box.min.x + box.max.x) * 0.5;
    const cy = (box.min.y + box.max.y) * 0.5;
    const xMid0 = box.min.x + size.x * 0.32;
    const xMid1 = box.min.x + size.x * 0.72;
    const point = new three.Vector3();
    let bestReach = 0;
    let bestX = cx;
    let bestY = cy;
    let reachXSum = 0;
    let reachYSum = 0;
    let reachWeight = 0;
    let maxBelow = 0;
    let maxAbove = 0;

    modelRoot.traverse((node) => {
      if (!node?.isMesh || !node.geometry?.attributes?.position) return;
      if (node.userData?.viewerHand || node.userData?.craftAttachment) return;
      const pos = node.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 2000));
      for (let i = 0; i < pos.count; i += step) {
        point.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
        if (point.x >= xMid0 && point.x <= xMid1) {
          const dy = point.y - cy;
          if (dy >= 0) maxAbove = Math.max(maxAbove, dy);
          else maxBelow = Math.max(maxBelow, -dy);
        }

        const dy = point.y - cy;
        const downBoost = dy < 0 ? 1.4 : 0.7;
        const lateral = Math.abs(point.x - cx);
        const vertical = Math.abs(dy);
        const reach = Math.max(lateral, vertical) * downBoost;
        if (reach < Math.max(size.x, size.y) * 0.12) continue;
        const weight = reach * reach;
        reachXSum += point.x * weight;
        reachYSum += point.y * weight;
        reachWeight += weight;
        if (reach > bestReach) {
          bestReach = reach;
          bestX = point.x;
          bestY = point.y;
        }
      }
    });

    return {
      reach: bestReach,
      x: reachWeight > 0 ? reachXSum / reachWeight : bestX,
      y: reachWeight > 0 ? reachYSum / reachWeight : bestY,
      below: maxBelow,
      above: maxAbove,
      cx,
      cy,
      size,
      box,
    };
  }

  function measureGunEndLowestY(modelRoot, three, side) {
    if (!modelRoot || !three) return null;
    modelRoot.updateMatrixWorld(true);
    const box = computeViewerBounds(modelRoot, three, {});
    if (box.isEmpty()) return null;
    const size = box.getSize(new three.Vector3());
    if (size.x < 1e-4) return null;
    const band = Math.max(size.x * 0.22, 0.01);
    const xMin = side === "left" ? box.min.x : box.max.x - band;
    const xMax = side === "left" ? box.min.x + band : box.max.x;
    const point = new three.Vector3();
    let lowest = Infinity;
    let count = 0;

    modelRoot.traverse((node) => {
      if (!node?.isMesh || !node.geometry?.attributes?.position) return;
      if (node.userData?.viewerHand || node.userData?.craftAttachment) return;
      const pos = node.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 1800));
      for (let i = 0; i < pos.count; i += step) {
        point.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
        if (point.x < xMin || point.x > xMax) continue;
        lowest = Math.min(lowest, point.y);
        count += 1;
      }
    });
    return count ? lowest : null;
  }

  function measureStockSideVerticalBias(modelRoot, three) {
    modelRoot.updateMatrixWorld(true);
    const box = computeViewerBounds(modelRoot, three, {});
    if (box.isEmpty()) return null;
    const size = box.getSize(new three.Vector3());
    const cy = (box.min.y + box.max.y) * 0.5;
    const xStock0 = box.min.x + size.x * 0.58;
    const xStock1 = box.max.x;
    const point = new three.Vector3();
    let below = 0;
    let above = 0;

    modelRoot.traverse((node) => {
      if (!node?.isMesh || !node.geometry?.attributes?.position) return;
      if (node.userData?.viewerHand || node.userData?.craftAttachment) return;
      const pos = node.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 1800));
      for (let i = 0; i < pos.count; i += step) {
        point.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
        if (point.x < xStock0 || point.x > xStock1) continue;
        const dy = point.y - cy;
        if (dy >= 0) above = Math.max(above, dy);
        else below = Math.max(below, -dy);
      }
    });
    return { below, above, cy };
  }

  function isGunBarrelFacingLeft(modelRoot, three) {
    const lobes = measureGunSilhouetteLobes(modelRoot, three);
    if (lobes.count > 20) {
      return lobes.bottomMeanX >= lobes.cx;
    }
    const leftRadius = measureGunEndRadius(modelRoot, three, "left");
    const rightRadius = measureGunEndRadius(modelRoot, three, "right");
    if (leftRadius > 0 && rightRadius > 0) {
      return leftRadius <= rightRadius * 0.97;
    }
    const grip = measureGripCluster(modelRoot, three);
    if (!grip.size || grip.reach <= 0) return true;
    return grip.x >= grip.cx;
  }

  // Standing side profile: length on X, grip/mag height on Y, thin depth on Z.
  function isGunStandingSideProfile(modelRoot, three) {
    if (!modelRoot || !three) return true;
    const size = computeViewerBounds(modelRoot, three, {}).getSize(new three.Vector3());
    if (!isGunHorizontalSideProfile(size)) return false;
    if (size.y < 1e-4 && size.z < 1e-4) return true;
    if (size.y >= size.z * 1.06) return true;
    if (size.z >= size.y * 1.06) return false;

    const grip = measureGripCluster(modelRoot, three);
    if (grip.below > 0 || grip.above > 0) {
      return grip.below >= grip.above * 0.85;
    }
    return size.y >= size.z;
  }

  function measureRegionVerticalExtents(modelRoot, three, xMinFrac, xMaxFrac) {
    modelRoot.updateMatrixWorld(true);
    const box = computeViewerBounds(modelRoot, three, {});
    if (box.isEmpty()) return null;
    const size = box.getSize(new three.Vector3());
    const cy = (box.min.y + box.max.y) * 0.5;
    const xMin = box.min.x + size.x * xMinFrac;
    const xMax = box.min.x + size.x * xMaxFrac;
    const point = new three.Vector3();
    let minY = Infinity;
    let maxY = -Infinity;
    let below = 0;
    let above = 0;
    let count = 0;

    modelRoot.traverse((node) => {
      if (!node?.isMesh || !node.geometry?.attributes?.position) return;
      if (node.userData?.viewerHand || node.userData?.craftAttachment) return;
      const pos = node.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 1800));
      for (let i = 0; i < pos.count; i += step) {
        point.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
        if (point.x < xMin || point.x > xMax) continue;
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
        const dy = point.y - cy;
        if (dy >= 0) above = Math.max(above, dy);
        else below = Math.max(below, -dy);
        count += 1;
      }
    });
    if (!count) return null;
    return { minY, maxY, below, above, cy, centerY: (minY + maxY) * 0.5, count };
  }

  // Horizontal spans of the bottom/top 20% silhouette bands.
  // Rifle upright: narrow bottom (grip/mag) + wider top (rail).
  // Sniper upright: wider bottom + narrow top (scope) — the rifle formula inverts.
  function measureGunSilhouetteLobes(modelRoot, three) {
    if (!modelRoot || !three) {
      return { span: 1, topSpan: 0, rifle: 0, sniper: 0, bottomMeanX: 0, cx: 0, count: 0 };
    }
    modelRoot.updateMatrixWorld(true);
    const box = computeViewerBounds(modelRoot, three, {});
    if (box.isEmpty()) {
      return { span: 1, topSpan: 0, rifle: 0, sniper: 0, bottomMeanX: 0, cx: 0, count: 0 };
    }
    const size = box.getSize(new three.Vector3());
    const cx = (box.min.x + box.max.x) * 0.5;
    const yCut = box.min.y + size.y * 0.2;
    const yTop = box.max.y - size.y * 0.2;
    const point = new three.Vector3();
    let bMin = Infinity;
    let bMax = -Infinity;
    let bN = 0;
    let bSumX = 0;
    let tMin = Infinity;
    let tMax = -Infinity;
    let tN = 0;

    modelRoot.traverse((node) => {
      if (!node?.isMesh || !node.visible || !node.geometry?.attributes?.position) return;
      if (node.userData?.viewerHand || node.userData?.craftAttachment) return;
      const pos = node.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 2200));
      for (let i = 0; i < pos.count; i += step) {
        point.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
        if (point.y <= yCut) {
          bMin = Math.min(bMin, point.x);
          bMax = Math.max(bMax, point.x);
          bSumX += point.x;
          bN += 1;
        }
        if (point.y >= yTop) {
          tMin = Math.min(tMin, point.x);
          tMax = Math.max(tMax, point.x);
          tN += 1;
        }
      }
    });

    const span = bN ? (bMax - bMin) / Math.max(size.x, 1e-6) : 1;
    const topSpan = tN ? (tMax - tMin) / Math.max(size.x, 1e-6) : 0;
    const rifle = (topSpan - span) * 8 - span * 6;
    const sniper = (span - topSpan) * 8 - topSpan * 6;
    return {
      span,
      topSpan,
      rifle,
      sniper,
      bottomMeanX: bN ? bSumX / bN : cx,
      cx,
      count: bN + tN,
    };
  }

  // Compare identity vs rotX(π). When neither roll looks rifle-upright (both rifle
  // scores < 1), use sniper interpretation (narrow scope on top). Max-extent stock
  // hang falsely prefers inverted guns whose rail/scope hangs "down".
  function gunSilhouettePrefersFlip(currentLobes, flippedLobes) {
    const rifleBest = Math.max(currentLobes.rifle, flippedLobes.rifle);
    if (rifleBest < 1) {
      return flippedLobes.sniper > currentLobes.sniper + 0.15;
    }
    return flippedLobes.rifle > currentLobes.rifle + 0.15;
  }

  // Cheap proxy for scoring: best of rifle/sniper lobe on the current roll only.
  // Full flip comparison happens in ensureGunStockDown.
  function measureGunStockHangBias(modelRoot, three) {
    const lobes = measureGunSilhouetteLobes(modelRoot, three);
    return Math.max(lobes.rifle, lobes.sniper);
  }

  function isGunGripPointingUp(modelRoot, three) {
    if (!modelRoot || !three) return false;
    const lobes = measureGunSilhouetteLobes(modelRoot, three);
    // Strong elongated-bottom silhouette = rail/scope on the bottom (inverted rifle/SMG).
    // Keep threshold strict so upright snipers (mildly negative rifle lobe) are not flagged.
    return lobes.rifle < -6;
  }

  function isGunStockHangingDown(modelRoot, three) {
    if (!modelRoot || !three) return true;
    return !isGunGripPointingUp(modelRoot, three);
  }

  function isGunPresentationValid(modelRoot, three) {
    if (!modelRoot || !three) return true;
    const size = computeViewerBounds(modelRoot, three, {}).getSize(new three.Vector3());
    if (size.x < size.y * 0.72 && size.x < size.z * 0.72) return false;
    if (!isGunStandingSideProfile(modelRoot, three)) return false;
    return isGunBarrelFacingLeft(modelRoot, three) && isGunStockHangingDown(modelRoot, three);
  }

  function scoreGunPresentationPose(modelRoot, three) {
    const size = computeViewerBounds(modelRoot, three, {}).getSize(new three.Vector3());
    let score = scoreGunOrientation(size);

    if (size.x >= size.y * 0.85 && size.x >= size.z * 0.85) score += 4;
    else if (size.x >= size.y * 0.72 && size.x >= size.z * 0.72) score += 2;
    else score -= 5;

    // Barrel length must run along X, not Y (vertical barrel-down/up).
    if (size.y > size.x * 1.05 && size.y >= size.z * 0.85) score -= 18;

    if (isGunBarrelFacingLeft(modelRoot, three)) score += 5;
    else score -= 5;

    if (isGunStandingSideProfile(modelRoot, three)) score += 7;
    else score -= 9;

    if (isGunStockHangingDown(modelRoot, three)) score += 5;
    else score -= 5;

    if (isGunGripPointingUp(modelRoot, three)) score -= 12;

    // Tie-break upright vs inverted using silhouette lobe confidence.
    const hangBias = measureGunStockHangBias(modelRoot, three);
    score += Math.max(-4, Math.min(4, hangBias * 0.45));

    return score;
  }

  function applyGunPresentationCorrections(modelRoot, three) {
    ensureGunStanding(modelRoot, three);
    // Upright first — barrel-end radius is unreliable while inverted / bullpup / suppressed.
    ensureGunStockDown(modelRoot, three);
    ensureGunBarrelFacesLeft(modelRoot, three);
  }

  // Market-card pose: barrel (muzzle) faces screen-left (-X).
  function ensureGunBarrelFacesLeft(modelRoot, three) {
    if (!modelRoot || !three) return;

    const flipLeftRight = () => {
      modelRoot.rotateOnWorldAxis(new three.Vector3(0, 1, 0), Math.PI);
      modelRoot.updateMatrixWorld(true);
    };

    // After upright: bottom silhouette mean X is the grip/mag (stock) side.
    const lobes = measureGunSilhouetteLobes(modelRoot, three);
    if (lobes.count > 20) {
      if (lobes.bottomMeanX < lobes.cx) flipLeftRight();
      return;
    }

    const leftRadius = measureGunEndRadius(modelRoot, three, "left");
    const rightRadius = measureGunEndRadius(modelRoot, three, "right");
    if (leftRadius > 0 && rightRadius > 0) {
      if (leftRadius > rightRadius * 1.03) flipLeftRight();
      return;
    }

    const grip = measureGripCluster(modelRoot, three);
    if (!grip.size) return;
    if (grip.reach > 0 && grip.x < grip.cx) flipLeftRight();
  }

  // Roll vertical (barrel along Y) and flat/table-top (length along Z) into horizontal side profile.
  function ensureGunStanding(modelRoot, three) {
    if (!modelRoot || !three) return;
    const size = computeViewerBounds(modelRoot, three, {}).getSize(new three.Vector3());
    if (isGunHorizontalSideProfile(size) && isGunStandingSideProfile(modelRoot, three)) return;

    const baseRotation = modelRoot.rotation.clone();
    let bestRotation = null;
    let bestScore = -Infinity;
    const axes = [
      new three.Vector3(1, 0, 0),
      new three.Vector3(0, 1, 0),
      new three.Vector3(0, 0, 1),
    ];

    [Math.PI / 2, -Math.PI / 2].forEach((angle) => {
      axes.forEach((axis) => {
        modelRoot.rotation.copy(baseRotation);
        modelRoot.updateMatrixWorld(true);
        modelRoot.rotateOnWorldAxis(axis, angle);
        modelRoot.updateMatrixWorld(true);
        const score = scoreGunPresentationPose(modelRoot, three);
        if (score > bestScore) {
          bestScore = score;
          bestRotation = modelRoot.rotation.clone();
        }
      });
    });

    if (bestRotation) {
      modelRoot.rotation.copy(bestRotation);
      modelRoot.updateMatrixWorld(true);
    }
  }

  // Mag / grip hang below the receiver (not upside-down).
  function ensureGunStockDown(modelRoot, three) {
    if (!modelRoot || !three) return;

    const baseRotation = modelRoot.rotation.clone();
    const currentLobes = measureGunSilhouetteLobes(modelRoot, three);

    modelRoot.rotateOnWorldAxis(new three.Vector3(1, 0, 0), Math.PI);
    modelRoot.updateMatrixWorld(true);
    const flippedLobes = measureGunSilhouetteLobes(modelRoot, three);

    if (!gunSilhouettePrefersFlip(currentLobes, flippedLobes)) {
      modelRoot.rotation.copy(baseRotation);
      modelRoot.updateMatrixWorld(true);
    }
  }

  function pickBestGunPresentationRotation(modelRoot, three, rotationCandidates, baseScore = -Infinity) {
    let bestRotation = modelRoot.rotation.clone();
    let bestScore = baseScore;

    rotationCandidates.forEach(([x, y, z]) => {
      modelRoot.rotation.set(x, y, z);
      modelRoot.updateMatrixWorld(true);
      applyGunPresentationCorrections(modelRoot, three);
      const score = scoreGunPresentationPose(modelRoot, three);
      if (score > bestScore) {
        bestScore = score;
        bestRotation = modelRoot.rotation.clone();
      }
    });

    return { bestRotation, bestScore };
  }

  function normalizeGunPresentation(modelRoot, three, options = {}) {
    if (!modelRoot || !three) return;

    // Deterministic CS2 inventory pose: reset → horizontal side profile → barrel left.
    modelRoot.rotation.set(0, 0, 0);
    modelRoot.updateMatrixWorld(true);
    ensureGunStanding(modelRoot, three);

    // Valve GLBs point toward +X; inventory cards show muzzle screen-left (-X).
    modelRoot.rotateOnWorldAxis(new three.Vector3(0, 1, 0), Math.PI);
    modelRoot.updateMatrixWorld(true);
    applyGunPresentationCorrections(modelRoot, three);

    if (!isGunPresentationValid(modelRoot, three) || isGunGripPointingUp(modelRoot, three)) {
      let bestRotation = modelRoot.rotation.clone();
      let bestScore = scoreGunPresentationPose(modelRoot, three);

      const bruteForce = pickBestGunPresentationRotation(modelRoot, three, GUN_PRESENTATION_ROTATIONS, bestScore);
      bestRotation = bruteForce.bestRotation;
      bestScore = bruteForce.bestScore;

      // Four upright side-profile flips: identity, barrel flip, roll flip, both.
      const baseEuler = bestRotation.clone();
      [
        [0, 0, 0],
        [0, Math.PI, 0],
        [Math.PI, 0, 0],
        [Math.PI, Math.PI, 0],
      ].forEach(([rx, ry]) => {
        modelRoot.rotation.copy(baseEuler);
        modelRoot.updateMatrixWorld(true);
        if (rx) modelRoot.rotateOnWorldAxis(new three.Vector3(1, 0, 0), rx);
        if (ry) modelRoot.rotateOnWorldAxis(new three.Vector3(0, 1, 0), ry);
        modelRoot.updateMatrixWorld(true);
        applyGunPresentationCorrections(modelRoot, three);
        const score = scoreGunPresentationPose(modelRoot, three);
        if (score > bestScore) {
          bestScore = score;
          bestRotation = modelRoot.rotation.clone();
        }
      });

      modelRoot.rotation.copy(bestRotation);
      modelRoot.updateMatrixWorld(true);
      applyGunPresentationCorrections(modelRoot, three);
    }

    // Final upright lock: silhouette lobes beat max-extent hang (rails/scopes).
    ensureGunStockDown(modelRoot, three);
    ensureGunBarrelFacesLeft(modelRoot, three);

    for (let attempt = 0; attempt < 4 && !isGunPresentationValid(modelRoot, three); attempt += 1) {
      if (!isGunBarrelFacingLeft(modelRoot, three)) {
        modelRoot.rotateOnWorldAxis(new three.Vector3(0, 1, 0), Math.PI);
      } else if (isGunGripPointingUp(modelRoot, three)) {
        modelRoot.rotateOnWorldAxis(new three.Vector3(1, 0, 0), Math.PI);
      } else if (!isGunStandingSideProfile(modelRoot, three)) {
        modelRoot.rotateOnWorldAxis(new three.Vector3(0, 0, 1), Math.PI / 2);
      } else {
        break;
      }
      modelRoot.updateMatrixWorld(true);
      applyGunPresentationCorrections(modelRoot, three);
    }

    // Last word: the handful of models the heuristic above cannot read.
    applyWeaponPoseCorrection(modelRoot, three, options);
  }

  function resolveStandardGunCameraPlacement(framedCenter, framedSize, three, options = {}) {
    const viewerAspect = Math.max(options.viewerAspect || 1, 1);
    const verticalFov = three.MathUtils.degToRad(options.cameraFov || VIEWER_CAMERA_FOV);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * viewerAspect);

    // Standing side profile: barrel length on X, grip height on Y, thin depth on Z.
    const lengthSize = Math.max(framedSize.x, 0.001);
    const heightSize = Math.max(framedSize.y, framedSize.z * 0.55, 0.001);
    const depthSize = Math.max(framedSize.z, 0.001);

    const fitHeightDistance = (heightSize * 0.5 * 1.16) / Math.tan(verticalFov / 2);
    const fitWidthDistance = (lengthSize * 0.5 * 1.02) / Math.tan(horizontalFov / 2);
    const cameraDistance = Math.max(fitHeightDistance, fitWidthDistance) * 1.34 + depthSize * 0.24;

    const focus = framedCenter.clone();
    const headroomPx = Number(options.presentationHeadroomPx) || 0;
    const panPx = Number(options.presentationPanPx) || 0;
    const viewerHeight = Math.max(Number(options.viewerHeight) || 0, 1);
    const viewerWidth = Math.max(Number(options.viewerWidth) || 0, 1);
    if (headroomPx > 0) {
      const visibleWorldHeight = 2 * Math.tan(verticalFov / 2) * cameraDistance;
      focus.y += (headroomPx / viewerHeight) * visibleWorldHeight;
    }
    if (panPx !== 0) {
      const visibleWorldWidth = 2 * Math.tan(horizontalFov / 2) * cameraDistance;
      focus.x += (panPx / viewerWidth) * visibleWorldWidth;
    }

    const position = focus.clone();
    position.z += cameraDistance * 0.94;

    return {
      position,
      focus,
      cameraDistance,
      maxDimension: Math.max(lengthSize, heightSize, depthSize),
    };
  }

  function resolveViewerCameraPlacement(framedCenter, framedSize, three, options = {}) {
    const isAgentModel = Boolean(options.isAgentModel);
    const isKnifeModel = Boolean(options.isKnifeModel);
    const viewerAspect = Math.max(options.viewerAspect || 1, 1);
    const verticalFov = three.MathUtils.degToRad(options.cameraFov || VIEWER_CAMERA_FOV);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * viewerAspect);

    const axes = [
      { axis: "x", value: framedSize.x },
      { axis: "y", value: framedSize.y },
      { axis: "z", value: framedSize.z },
    ].sort((left, right) => right.value - left.value);

    const lengthAxis = axes[0].axis;
    const heightAxis = axes[1].axis;
    const viewAxis = axes[2].axis;
    const lengthSize = axes[0].value || 1;
    const heightSize = axes[1].value || 1;
    const depthSize = axes[2].value || 1;

    const verticalFitScale = isAgentModel ? 1 : (isKnifeModel ? 1.04 : 1.14);
    const fitHeightDistance = (heightSize * 0.5 * verticalFitScale) / Math.tan(verticalFov / 2);
    const fitWidthDistance = (lengthSize * 0.5) / Math.tan(horizontalFov / 2);
    const cameraDistance = isAgentModel
      ? Math.max(fitHeightDistance * 1.04, fitWidthDistance * 1.12) + depthSize * 0.26
      : isKnifeModel
        ? Math.max(fitHeightDistance, fitWidthDistance) * 1.06 + depthSize * 0.24
        : Math.max(fitHeightDistance, fitWidthDistance) * 1.34 + depthSize * 0.35;

    const focus = framedCenter.clone();
    focus[heightAxis] += heightSize * (isAgentModel ? 0.14 : (isKnifeModel ? 0.04 : 0.045));

    const position = framedCenter.clone();
    position[viewAxis] += cameraDistance * 0.94;
    position[heightAxis] += heightSize * (isAgentModel ? 0.16 : (isKnifeModel ? 0.08 : 0.12));

    if (!isAgentModel && lengthAxis === "y") {
      position.x += lengthSize * 0.08;
    }

    return {
      position,
      focus,
      cameraDistance,
      maxDimension: Math.max(lengthSize, heightSize, depthSize),
    };
  }

  function disposeCraftAttachments(modelRoot) {
    if (!modelRoot) return;
    modelRoot.userData.craftCharmPhysics = [];
    disposeCraftPreview(modelRoot);
    const toRemove = [];
    modelRoot.traverse((child) => {
      if (child.userData?.craftAttachment || child.userData?.craftOrphanCharm) toRemove.push(child);
    });
    toRemove.forEach((child) => {
      child.userData.charmPhysics = null;
      child.parent?.remove(child);
      disposeCraftNodeTree(child);
    });
  }

  function disposeCraftNodeTree(root) {
    if (!root) return;
    root.traverse((node) => {
      node.geometry?.dispose?.();
      if (!node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        // Keep texture image data alive for the craftTextureCache; only drop the material.
        material.dispose?.();
      });
    });
  }

  function disposeCraftPreview(modelRoot) {
    if (!modelRoot) return;
    const toRemove = [];
    modelRoot.traverse((child) => {
      if (child.userData?.craftPreview) toRemove.push(child);
    });
    toRemove.forEach((child) => {
      child.userData.charmPhysics = null;
      child.parent?.remove(child);
      disposeCraftNodeTree(child);
    });
    modelRoot.userData.craftCharmPreviewAnchor = null;
    modelRoot.userData.craftCharmPreviewPhysics = null;
  }

  function hitToPlacement(hit, three, camera, modelRoot = null, slotIndex = null, options = {}) {
    if (!hit?.point) return null;
    const normal = ensureOutwardNormal(worldNormalFromHit(hit, three), hit.point, camera, three);
    let point = hit.point.clone();
    let storedNormal = normal.clone();
    let space = "world";
    if (modelRoot) {
      modelRoot.updateMatrixWorld(true);
      modelRoot.worldToLocal(point);
      storedNormal.transformDirection(new three.Matrix4().copy(modelRoot.matrixWorld).invert()).normalize();
      space = "model";
    }
    const placement = {
      point: [point.x, point.y, point.z],
      normal: [storedNormal.x, storedNormal.y, storedNormal.z],
      meshUuid: hit.object?.uuid || "",
      space,
    };
    if (modelRoot && Number.isInteger(slotIndex)) {
      const inspect = computeInspectPlacementOffsets(modelRoot, hit, three, camera, slotIndex, {
        ...options,
        rotationDegrees: options.rotationDegrees ?? stickerRotationFromEntry(options.entry),
      });
      if (inspect) placement.inspect = inspect;
    }
    return placement;
  }

  function placementPointWorld(placement, modelRoot, three) {
    const point = new three.Vector3(
      Number(placement?.point?.[0]) || 0,
      Number(placement?.point?.[1]) || 0,
      Number(placement?.point?.[2]) || 0
    );
    if (placement?.space === "model" && modelRoot && three) {
      modelRoot.updateMatrixWorld(true);
      modelRoot.localToWorld(point);
    }
    return point;
  }

  function placementNormalWorld(placement, modelRoot, three) {
    const normal = Array.isArray(placement?.normal) && placement.normal.length >= 3
      ? new three.Vector3(
        Number(placement.normal[0]) || 0,
        Number(placement.normal[1]) || 0,
        Number(placement.normal[2]) || 1
      )
      : new three.Vector3(0, 0, 1);
    if (placement?.space === "model" && modelRoot && three) {
      modelRoot.updateMatrixWorld(true);
      normal.transformDirection(modelRoot.matrixWorld);
    }
    return normal.normalize();
  }

  function clampInspectValue(value, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(max, Math.max(min, parsed));
  }

  function roundInspectValue(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.round(parsed * 10000) / 10000;
  }

  /**
   * CS2 sticker offsets are relative to the weapon's preset slot origin — not the model center.
   * Map the custom hit as a tangent-space delta from the default slot hit so inspect links
   * place stickers near where the crafter preview shows them.
   */
  /**
   * CS2 keychain offsets are absolute-ish in weapon/attachment space (Source Z-up),
   * not sticker slot-relative units. Crafter models are already near Source scale.
   * Map Three.js Y-up local deltas onto Source XYZ with Y lateral / Z vertical.
   */
  function computeInspectCharmOffsets(modelRoot, hit, three, camera, options = {}) {
    if (!modelRoot || !hit?.point || !three) return null;
    modelRoot.updateMatrixWorld(true);
    const bounds = computeViewerBounds(modelRoot, three, options);
    const layout = computeCraftAttachmentLayout(bounds, three, options);
    const charmMeshes = collectMeshesForCraftKind(modelRoot, "charm");
    const meshes = charmMeshes.length ? charmMeshes : collectCraftRaycastMeshes(modelRoot);
    if (!meshes.length) return null;
    prepareCraftRaycastMeshes(meshes);

    const defaultHit = findCharmHit(meshes, bounds, layout, three, {
      ...options,
      modelRoot,
      camera,
    }, null);
    if (!defaultHit?.point) return null;

    const localHit = hit.point.clone();
    const localDefault = defaultHit.point.clone();
    modelRoot.worldToLocal(localHit);
    modelRoot.worldToLocal(localDefault);
    const delta = localHit.sub(localDefault);

    // Three (Y-up) → Source keychain offsets (Z-up). Negate vertical so crafter "up"
    // matches CS2 inspect "up" (observed inversion when signs matched 1:1).
    const offsetX = clampInspectValue(delta.x, -12, 12);
    const offsetY = clampInspectValue(-delta.z, -8, 8);
    const offsetZ = clampInspectValue(delta.y, -8, 8);

    const nearDefault = Math.hypot(offsetX, offsetY, offsetZ) < 0.04;
    if (nearDefault) {
      return {
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
        nearDefault: true,
      };
    }

    return {
      offsetX: roundInspectValue(offsetX),
      offsetY: roundInspectValue(offsetY),
      offsetZ: roundInspectValue(offsetZ),
      nearDefault: false,
    };
  }

  function computeInspectPlacementOffsets(modelRoot, hit, three, camera, slotIndex, options = {}) {
    if (!modelRoot || !hit?.point || !three) return null;
    modelRoot.updateMatrixWorld(true);

    const meshes = Array.isArray(options.meshes) && options.meshes.length
      ? options.meshes
      : collectStickerRaycastMeshes(modelRoot);
    const rayMeshes = meshes.length ? meshes : collectCraftRaycastMeshes(modelRoot);
    if (!rayMeshes.length) return null;
    prepareCraftRaycastMeshes(rayMeshes);

    const bounds = computeViewerBounds(modelRoot, three, options);
    const layout = computeCraftAttachmentLayout(bounds, three, options);
    const size = bounds.getSize(new three.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
    const weaponName = resolveWeaponNameFromTitle(options.itemTitle);
    const stickerSize = resolveStickerSizeForSlot(
      layout.baseStickerSize,
      weaponName,
      Number.isInteger(slotIndex) ? slotIndex : 0,
      options
    );

    // Default slot surface hit (no custom placement on the probe entry).
    const defaultHit = Number.isInteger(slotIndex)
      ? findStickerHit(rayMeshes, bounds, slotIndex, layout, three, options, null)
      : null;

    const customNormal = ensureOutwardNormal(worldNormalFromHit(hit, three), hit.point, camera, three);
    const basisNormal = defaultHit
      ? ensureOutwardNormal(worldNormalFromHit(defaultHit, three), defaultHit.point, camera, three)
      : customNormal;

    const orientation = buildDecalOrientation(basisNormal, (defaultHit || hit).point, camera, three);
    const tangent = new three.Vector3(1, 0, 0).applyEuler(orientation).normalize();
    const bitangent = new three.Vector3(0, 1, 0).applyEuler(orientation).normalize();
    const normal = new three.Vector3(0, 0, 1).applyEuler(orientation).normalize();

    const originPoint = defaultHit?.point ? defaultHit.point.clone() : hit.point.clone();
    const delta = hit.point.clone().sub(originPoint);

    // Convert world delta → CS2 slot-relative units (≈ sticker diameters).
    // CS2 offsetY is inverted vs Three.js decal bitangent (up in crafter → down in inspect).
    const unit = Math.max(stickerSize * 0.92, maxDimension * 0.045, 0.02);
    const offsetX = clampInspectValue(tangent.dot(delta) / unit, -0.55, 0.55);
    const offsetY = clampInspectValue((-bitangent.dot(delta)) / unit, -0.55, 0.55);
    const offsetZ = clampInspectValue(normal.dot(delta) / unit, -0.28, 0.28);

    const userRotation = Number(options.rotationDegrees);
    const rotation = Number.isFinite(userRotation) ? userRotation : 0;

    // Near the default slot with no user rotation → omit custom fields (pure slot craft).
    const nearDefault = Math.hypot(offsetX, offsetY, offsetZ) < 0.03 && Math.abs(rotation) < 0.5;
    if (nearDefault) {
      return {
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
        rotation: 0,
        scale: 1,
        nearDefault: true,
      };
    }

    return {
      offsetX: roundInspectValue(offsetX),
      offsetY: roundInspectValue(offsetY),
      offsetZ: roundInspectValue(offsetZ),
      rotation: roundInspectValue(rotation),
      scale: 1,
      nearDefault: false,
    };
  }

  function resolveNearestEmptyStickerSlot(modelRoot, point, occupiedSlots, three, options = {}) {
    if (!modelRoot || !point || !three) return -1;
    modelRoot.updateMatrixWorld(true);
    const bounds = computeViewerBounds(modelRoot, three, options);
    const center = bounds.getCenter(new three.Vector3());
    const size = bounds.getSize(new three.Vector3());
    const weaponName = resolveWeaponNameFromTitle(options.itemTitle);
    const occupied = new Set(
      (Array.isArray(occupiedSlots) ? occupiedSlots : [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value))
    );

    let bestSlot = -1;
    let bestDist = Infinity;
    for (let slot = 0; slot < 5; slot += 1) {
      if (occupied.has(slot)) continue;
      const anchor = resolveStickerSlotAnchor(weaponName, slot, center, size, three, options);
      const dist = anchor.distanceToSquared(point);
      if (dist < bestDist) {
        bestDist = dist;
        bestSlot = slot;
      }
    }
    return bestSlot;
  }

  function placementFromEntry(entry) {
    const placement = entry?.placement;
    if (!placement || !Array.isArray(placement.point) || placement.point.length < 3) {
      return null;
    }
    return placement;
  }

  function findCharmPresetHit(meshes, bounds, layout, three, options, presetIndex, entry) {
    const customPlacement = placementFromEntry(entry);
    if (customPlacement) {
      return resolvePlacementHit(customPlacement, meshes, three, options.modelRoot || null);
    }

    const center = bounds.getCenter(new three.Vector3());
    const camera = options.camera || null;
    const size = bounds.getSize(new three.Vector3());
    const preset = ((presetIndex % 5) + 5) % 5;
    const t = (preset + 0.5) / 5;
    const isSlab = String(entry?.market_hash_name || "").startsWith("Sticker Slab |");
    const anchor = new three.Vector3(
      center.x + size.x * ((t - 0.5) * 0.42 + (isSlab ? 0.04 : -0.08)),
      center.y + size.y * (0.02 + (preset % 2) * 0.03),
      center.z + size.z * (0.34 - preset * 0.035)
    );

    const cameraHit = raycastMeshesFromCamera(meshes, camera, anchor, three);
    if (cameraHit) return cameraHit;

    const primary = layout.charmRay;
    const candidates = primary ? [primary] : [];
    const directions = [
      new three.Vector3(0, 0, -1),
      new three.Vector3(0, -0.1, -1),
      new three.Vector3(-1, 0, 0),
    ];
    if (camera) {
      const camDir = new three.Vector3().subVectors(camera.position, center).normalize();
      directions.unshift(camDir.clone().negate());
    }
    directions.forEach((direction) => {
      const dir = direction.clone().normalize();
      const origin = anchor.clone().addScaledVector(dir, -Math.max(size.length() * 0.3, 0.1));
      candidates.push({ origin, direction: dir });
    });

    for (let i = 0; i < candidates.length; i += 1) {
      const hit = raycastSkinMeshes(meshes, candidates[i].origin, candidates[i].direction, three);
      if (hit) return hit;
    }

    const fallbackNormal = camera
      ? new three.Vector3().subVectors(camera.position, anchor).normalize()
      : new three.Vector3(0, 0, 1);
    return createSyntheticHit(meshes[0], anchor, fallbackNormal, three);
  }

  function resolveCraftPresetPlacement(modelRoot, three, options, kind, presetIndex, entry) {
    if (!modelRoot || !three) return null;
    modelRoot.updateMatrixWorld(true);
    const bounds = computeViewerBounds(modelRoot, three, options);
    const layout = computeCraftAttachmentLayout(bounds, three, options);
    const meshes = collectMeshesForCraftKind(modelRoot, kind);
    if (!meshes.length) return null;
    prepareCraftRaycastMeshes(meshes);

    const preset = ((presetIndex % 5) + 5) % 5;
    let hit = null;
    if (kind === "sticker") {
      hit = findStickerHit(meshes, bounds, preset, layout, three, options, entry);
    } else {
      hit = findCharmPresetHit(meshes, bounds, layout, three, options, preset, entry);
    }
    return hitToPlacement(hit, three, options.camera || null, modelRoot, kind === "sticker" ? preset : null, {
      ...options,
      entry,
      meshes,
    });
  }

  function resolveCraftSurfacePlacement(modelRoot, three, options, kind, entry, clientX, clientY) {
    if (!modelRoot || !three || !options.renderer || !options.camera) return null;
    const placement = raycastCraftSurfaceFromClient(
      options.renderer,
      options.camera,
      modelRoot,
      clientX,
      clientY,
      three,
      { kind }
    );
    if (placement) return placement;

    // Pointer placement must follow the cursor — never snap to a preset while aiming.
    if (clientX == null || clientY == null) {
      if (kind === "sticker" || kind === "charm" || kind === "slab") {
        return resolveCraftPresetPlacement(modelRoot, three, options, kind === "slab" ? "charm" : kind, 2, entry);
      }
    }
    return null;
  }

  function setOrbitPlacementMode(controls, active, three) {
    if (!controls || !three?.MOUSE) return;
    if (active) {
      controls.mouseButtons = {
        LEFT: null,
        MIDDLE: three.MOUSE.DOLLY,
        RIGHT: three.MOUSE.ROTATE,
      };
    } else {
      controls.mouseButtons = {
        LEFT: three.MOUSE.ROTATE,
        MIDDLE: three.MOUSE.DOLLY,
        RIGHT: three.MOUSE.PAN,
      };
    }
  }

  function resolveCraftCharmSize(modelRoot, three, options = {}) {
    if (Number.isFinite(modelRoot?.userData?.craftCharmSize)) {
      return modelRoot.userData.craftCharmSize;
    }
    const bounds = computeViewerBounds(modelRoot, three, options);
    const layout = computeCraftAttachmentLayout(bounds, three, options);
    modelRoot.userData.craftCharmSize = layout.charmSize;
    return layout.charmSize;
  }

  function tryRepositionCharmPreview(modelRoot, preview, three, options = {}) {
    const entry = { ...preview.entry, placement: preview.placement || preview.entry?.placement || null };
    if (!entry.placement) return false;

    const previewKey = resolveCharmPreviewKey(entry);
    const existing = modelRoot.userData.craftCharmPreviewAnchor;
    if (!existing || existing.userData.previewKey !== previewKey) return false;

    const meshes = collectMeshesForCraftKind(modelRoot, "charm");
    if (!meshes.length) return false;
    prepareCraftRaycastMeshes(meshes);

    const hit = resolvePlacementHit(entry.placement, meshes, three, modelRoot);
    if (!hit) return false;

    const isSlab = String(entry?.market_hash_name || "").startsWith("Sticker Slab |")
      || preview.kind === "slab";
    const isMissingLink = /missinglink|wurst|hot\s*wurst|missing\s*link/i.test(
      String(entry?.market_hash_name || entry?.display_name || entry?.model_url || "")
    );
    const charmRef = String(
      entry?.model_url || entry?.model_token || entry?.market_hash_name || entry?.display_name || ""
    );
    const isHighlightCharm = Boolean(existing.userData?.charmIsHighlight)
      || isHighlightDogTagHint(charmRef);
    const keepNativeHoldPin = Boolean(existing.userData?.keepNativeHoldPin)
      || isNativeHoldPinCharmHint(charmRef);
    updateCharmAnchorFromHit(
      existing,
      hit,
      resolveCraftCharmSize(modelRoot, three, options),
      three,
      {
        ...options,
        isSlab,
        isMissingLink,
        isHighlightCharm,
        isGunCharm: Boolean(existing.userData?.charmIsGun),
        isGrenadeCharm: Boolean(existing.userData?.charmIsGrenade),
        keepNativeHoldPin,
        forCharacterCharm: Boolean(existing.userData?.charmIsCharacter) || keepNativeHoldPin,
        forMissingLink: isMissingLink && !keepNativeHoldPin,
        modelRoot,
      }
    );
    return true;
  }

  function syncCraftPreview(modelRoot, preview, three, options = {}) {
    if (!modelRoot || !three || !preview?.entry?.image) {
      disposeCraftPreview(modelRoot);
      return Promise.resolve();
    }

    const kind = preview.kind || "sticker";
    if (kind !== "sticker" && tryRepositionCharmPreview(modelRoot, preview, three, options)) {
      return Promise.resolve();
    }

    modelRoot.updateMatrixWorld(true);
    const bounds = computeViewerBounds(modelRoot, three, options);
    const meshes = collectMeshesForCraftKind(modelRoot, kind === "slab" ? "charm" : kind);
    if (!meshes.length) {
      disposeCraftPreview(modelRoot);
      return Promise.resolve();
    }
    prepareCraftRaycastMeshes(meshes);

    const layout = computeCraftAttachmentLayout(bounds, three, options);
    modelRoot.userData.craftCharmSize = layout.charmSize;
    const weaponName = resolveWeaponNameFromTitle(options.itemTitle);
    const entry = { ...preview.entry, placement: preview.placement || preview.entry?.placement || null };
    const previewOptions = { ...options, isPreview: true, modelRoot };

    disposeCraftPreview(modelRoot);
    const generation = (modelRoot.userData.craftPreviewGeneration || 0) + 1;
    modelRoot.userData.craftPreviewGeneration = generation;
    const jobs = [];

    if (kind === "sticker") {
      const slotIndex = Number.isInteger(preview.slotIndex) ? preview.slotIndex : 0;
      const hit = entry.placement
        ? resolvePlacementHit(entry.placement, meshes, three, modelRoot)
        : findStickerHit(meshes, bounds, slotIndex, layout, three, { ...options, modelRoot }, entry);
      if (hit) {
        const stickerSize = resolveStickerSizeForSlot(layout.baseStickerSize, weaponName, slotIndex, options);
        jobs.push(attachStickerDecal(modelRoot, hit, entry, stickerSize, three, slotIndex, {
          ...previewOptions,
          syncGeneration: generation,
        }));
      }
    } else {
      let hit = entry.placement
        ? resolvePlacementHit(entry.placement, meshes, three, modelRoot)
        : null;
      if (!hit) {
        hit = findCharmPresetHit(
          meshes,
          bounds,
          layout,
          three,
          { ...options, modelRoot },
          Number.isInteger(preview.presetIndex) ? preview.presetIndex : 2,
          entry
        );
      }
      if (hit) {
        const isSlabPreview = kind === "slab" || isStickerSlabEntry(entry, { kind });
        jobs.push(attachCharmModel(modelRoot, hit, entry, layout.charmSize * (isSlabPreview ? 1.4 : 1), three, {
          ...previewOptions,
          syncGeneration: generation,
          isSlab: isSlabPreview,
        }));
      }
    }

    return Promise.all(jobs).then(() => undefined);
  }

  function isStickerSlabEntry(entry, options = {}) {
    if (options?.isSlab || options?.kind === "slab") return true;
    const name = String(entry?.market_hash_name || entry?.display_name || "").trim();
    if (/^Sticker Slab\s*\|/i.test(name)) return true;
    const model = String(entry?.model_url || entry?.model3d || entry?.gltf || "").toLowerCase();
    return /sticker_display_case|kc_sticker_display/.test(model);
  }

  function bakeCraftTextureForMesh(texture, three) {
    if (!texture || !three) return null;
    const img = texture.image;
    let w = Number(img?.naturalWidth || img?.width || 0);
    let h = Number(img?.naturalHeight || img?.height || 0);
    if (w <= 0 || h <= 0) {
      if (img && img.complete) {
        w = 512; h = 512;
      } else {
        texture.encoding = three.sRGBEncoding;
        if ("colorSpace" in texture && three.SRGBColorSpace) {
          texture.colorSpace = three.SRGBColorSpace;
        }
        texture.flipY = true;
        texture.needsUpdate = true;
        return texture;
      }
    }
    if (typeof document !== "undefined") {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const baked = new three.CanvasTexture(canvas);
          baked.encoding = three.sRGBEncoding;
          if ("colorSpace" in baked && three.SRGBColorSpace) {
            baked.colorSpace = three.SRGBColorSpace;
          }
          baked.flipY = true;
          baked.needsUpdate = true;
          baked.userData = { ...(baked.userData || {}), craftBaked: true };
          return baked;
        }
      } catch (_error) {
        // Fall through to the source texture.
      }
    }
    texture.encoding = three.sRGBEncoding;
    if ("colorSpace" in texture && three.SRGBColorSpace) {
      texture.colorSpace = three.SRGBColorSpace;
    }
    texture.flipY = true;
    texture.needsUpdate = true;
    return texture;
  }

  function resolveCraftImageUrl(imageUrl) {
    const raw = String(imageUrl || "").trim();
    if (!raw) return "";
    if (!/^https?:\/\//i.test(raw)) return raw;
    if (
      /community\.(steamstatic|akamai\.steamstatic)\.com|steamcommunity-a\.akamaihd\.net|cdn\.steamstatic\.com|steamcdn-a\.akamaihd\.net/i.test(raw)
      || (() => {
        try {
          return /(?:^|\.)csroi\.com$/i.test(new URL(raw).hostname);
        } catch (_error) {
          return /csroi\.com/i.test(raw);
        }
      })()
    ) {
      return `proxy_craft_image.php?url=${encodeURIComponent(raw)}`;
    }
    return raw;
  }

  function loadCraftTexture(imageUrl, three) {
    const primaryUrl = resolveCraftImageUrl(imageUrl);
    if (!primaryUrl) return Promise.resolve(null);

    const cached = craftTextureCache.get(primaryUrl);
    if (cached) return Promise.resolve(cached);

    // Add a WebGL-specific cache buster so browser doesn't reuse a non-CORS cached response
    // from thumbnail <img> tags (which would cause tainted canvas / black texture).
    const glUrl = primaryUrl + (primaryUrl.includes("?") ? "&" : "?") + "_gl=1";

    const tryLoad = (url, useCrossOrigin) => new Promise((resolve) => {
      const loader = new three.TextureLoader();
      if (useCrossOrigin) loader.setCrossOrigin("anonymous");
      else if (loader.setCrossOrigin) loader.setCrossOrigin(null);
      loader.load(
        url,
        (texture) => {
          texture.encoding = three.sRGBEncoding;
          if ("colorSpace" in texture && three.SRGBColorSpace) {
            texture.colorSpace = three.SRGBColorSpace;
          }
          texture.flipY = true;
          texture.needsUpdate = true;
          resolve(texture);
        },
        undefined,
        () => resolve(null)
      );
    });

    const isSameOrigin = /^proxy_craft_image\.php|^assets\/|^(?!\w+:\/\/)/.test(glUrl);

    // Same-origin proxy: no crossOrigin needed (avoids taint issues).
    // External: try crossOrigin first, then without.
    const firstTry = tryLoad(glUrl, !isSameOrigin);
    return firstTry.then((texture) => {
      if (texture) {
        craftTextureCache.set(primaryUrl, texture);
        return texture;
      }
      // Retry opposite CORS setting
      return tryLoad(glUrl, isSameOrigin).then((tex2) => {
        if (tex2) {
          craftTextureCache.set(primaryUrl, tex2);
          return tex2;
        }
        const raw = String(imageUrl || "").trim();
        if (!raw || raw === primaryUrl) return null;
        const rawGl = raw + (raw.includes("?") ? "&" : "?") + "_gl=1";
        return tryLoad(rawGl, false).then((fallback) => {
          if (fallback) craftTextureCache.set(primaryUrl, fallback);
          return fallback;
        });
      });
    });
  }

  function collectSkinPaintMeshes(modelRoot) {
    const meshes = [];
    modelRoot.traverse((child) => {
      if (isSkinPaintMesh(child)) meshes.push(child);
    });
    return meshes;
  }

  function collectCraftRaycastMeshes(modelRoot) {
    const meshes = [];
    modelRoot.traverse((child) => {
      if (child.userData?.craftAttachment || isUnderCraftAttachment(child)) return;
      if (!isViewerBoundsMesh(child)) return;
      if (isLegacyViewerMesh(child)) return;
      meshes.push(child);
    });
    return meshes.length ? meshes : collectSkinPaintMeshes(modelRoot);
  }

  function collectMeshesForCraftKind(modelRoot, kind = "sticker") {
    const normalized = kind === "slab" ? "charm" : kind;
    if (normalized === "charm") {
      return collectCraftRaycastMeshes(modelRoot);
    }
    const stickerMeshes = collectStickerRaycastMeshes(modelRoot);
    return stickerMeshes.length ? stickerMeshes : collectCraftRaycastMeshes(modelRoot);
  }

  function prepareCraftRaycastMeshes(meshes) {
    meshes.forEach((mesh) => {
      if (mesh.isSkinnedMesh) mesh.skeleton?.update?.();
      mesh.updateMatrixWorld(true);
    });
  }

  function raycastSkinMeshes(meshes, origin, direction, three) {
    const raycaster = new three.Raycaster();
    const dir = direction.clone();
    if (dir.lengthSq() < 1e-8) return null;
    dir.normalize();
    raycaster.set(origin, dir);
    raycaster.far = 50;
    raycaster.near = 0.001;
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0] : null;
  }

  function worldNormalFromHit(hit, three) {
    const normal = new three.Vector3(0, 0, 1);
    if (hit?.face?.normal) {
      normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
    }
    return normal;
  }

  function createSyntheticHit(mesh, point, normalWorld, three) {
    if (!mesh) return null;
    const inverse = new three.Matrix4().copy(mesh.matrixWorld).invert();
    const localNormal = normalWorld.clone().transformDirection(inverse).normalize();
    return {
      point: point.clone(),
      object: mesh,
      distance: 0,
      face: { normal: localNormal },
    };
  }

  function findCraftMeshByUuid(meshes, uuid) {
    const id = String(uuid || "").trim();
    if (!id) return null;
    return meshes.find((mesh) => mesh.uuid === id) || null;
  }

  function resolvePlacementHit(placement, meshes, three, modelRoot = null) {
    if (!placement || !Array.isArray(placement.point) || placement.point.length < 3) {
      return null;
    }

    const point = placementPointWorld(placement, modelRoot, three);
    const normalWorld = placementNormalWorld(placement, modelRoot, three);
    const uuidMesh = findCraftMeshByUuid(meshes, placement.meshUuid);
    const mesh = uuidMesh || meshes.find((candidate) => candidate?.isMesh) || meshes[0];
    // Use the exact stored point — re-raycasting on curved slides drifts up/down each sync.
    return createSyntheticHit(mesh, point, normalWorld, three);
  }

  function hasWeaponStickerSlotPresets(weaponName) {
    const weaponClass = resolveWeaponStickerClass(weaponName);
    return Boolean(
      WEAPON_STICKER_SLOT_ANCHORS[weaponName]
      || WEAPON_CLASS_STICKER_SLOT_ANCHORS[weaponClass]
    );
  }

  function scoreStickerSurfaceHit(hit, camera, three) {
    if (!hit?.point) return -Infinity;
    const normal = ensureOutwardNormal(worldNormalFromHit(hit, three), hit.point, camera, three);
    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);
    let score = absZ * 5 - absY * 4;
    if (normal.z > 0.25) score += 2;
    if (absY > 0.72 && absZ < 0.35) score -= 8;
    if (absX > 0.72 && absZ < 0.35) score -= 4;
    return score;
  }

  function pickBestStickerRaycastHit(meshes, candidates, camera, three) {
    let bestHit = null;
    let bestScore = -Infinity;
    candidates.forEach(({ origin, direction }) => {
      const hit = raycastSkinMeshes(meshes, origin, direction, three);
      if (!hit) return;
      const score = scoreStickerSurfaceHit(hit, camera, three);
      if (score > bestScore) {
        bestScore = score;
        bestHit = hit;
      }
    });
    return bestHit;
  }

  function resolveStickerFallbackNormal(anchor, camera, three) {
    const sideNormal = new three.Vector3(0, 0, 1);
    return camera ? ensureOutwardNormal(sideNormal, anchor, camera, three) : sideNormal;
  }

  function raycastMeshesFromCamera(meshes, camera, anchor, three) {
    if (!camera || !meshes.length) return null;
    prepareCraftRaycastMeshes(meshes);
    const raycaster = new three.Raycaster();
    const direction = anchor.clone().sub(camera.position);
    if (direction.lengthSq() < 1e-8) return null;
    direction.normalize();
    raycaster.set(camera.position, direction);
    raycaster.far = camera.position.distanceTo(anchor) + 2;
    raycaster.near = 0.001;
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0] : null;
  }

  function findStickerHit(meshes, bounds, slotIndex, layout, three, options = {}, entry = null) {
    const customPlacement = stickerPlacementFromEntry(entry);
    if (customPlacement) {
      return resolvePlacementHit(customPlacement, meshes, three, options.modelRoot || null);
    }

    const center = bounds.getCenter(new three.Vector3());
    const camera = options.camera || null;
    const size = bounds.getSize(new three.Vector3());
    const weaponName = resolveWeaponNameFromTitle(options.itemTitle);
    const anchor = resolveStickerSlotAnchor(weaponName, slotIndex, center, size, three, options);
    const primaryRay = layout.stickerRays[slotIndex];
    const candidates = [];

    if (primaryRay) {
      candidates.push(primaryRay);
    }

    if (camera) {
      const camDir = new three.Vector3().subVectors(camera.position, anchor);
      if (camDir.lengthSq() > 1e-8) {
        camDir.normalize();
        candidates.push({
          origin: anchor.clone().addScaledVector(camDir, Math.max(size.length() * 0.18, 0.08)),
          direction: camDir.clone().negate(),
        });
      }
    }

    const directions = [
      new three.Vector3(0, 0, -1),
      new three.Vector3(0, -0.12, -1),
      new three.Vector3(1, 0, 0),
      new three.Vector3(-1, 0, 0),
    ];

    directions.forEach((direction) => {
      const dir = direction.clone().normalize();
      const origin = anchor.clone().addScaledVector(dir, -Math.max(size.length() * 0.35, 0.12));
      candidates.push({ origin, direction: dir });
    });

    const bestHit = pickBestStickerRaycastHit(meshes, candidates, camera, three);
    if (bestHit) return bestHit;

    const fallbackNormal = resolveStickerFallbackNormal(anchor, camera, three);
    const fallbackMesh = meshes[0];
    return createSyntheticHit(fallbackMesh, anchor, fallbackNormal, three);
  }

  function findCharmHit(meshes, bounds, layout, three, options = {}, charm = null) {
    const customPlacement = charmPlacementFromEntry(charm);
    if (customPlacement) {
      const customHit = resolvePlacementHit(customPlacement, meshes, three, options.modelRoot || null);
      if (customHit) return customHit;
    }

    const center = bounds.getCenter(new three.Vector3());
    const camera = options.camera || null;
    const primary = layout.charmRay;
    const candidates = primary ? [primary] : [];
    const size = bounds.getSize(new three.Vector3());
    const isSlab = String(charm?.market_hash_name || "").startsWith("Sticker Slab |");
    const anchor = new three.Vector3(
      center.x + size.x * (isSlab ? 0.06 : -0.12),
      center.y + size.y * 0.02,
      center.z + size.z * 0.34
    );
    const directions = [
      new three.Vector3(0, 0, -1),
      new three.Vector3(0, -0.1, -1),
      new three.Vector3(-1, 0, 0),
    ];
    if (camera) {
      const camDir = new three.Vector3().subVectors(camera.position, center).normalize();
      directions.unshift(camDir.clone().negate());
    }
    directions.forEach((direction) => {
      const dir = direction.clone().normalize();
      const origin = anchor.clone().addScaledVector(dir, -Math.max(size.length() * 0.3, 0.1));
      candidates.push({ origin, direction: dir });
    });

    for (let i = 0; i < candidates.length; i += 1) {
      const hit = raycastSkinMeshes(meshes, candidates[i].origin, candidates[i].direction, three);
      if (hit) return hit;
    }

    const fallbackNormal = camera
      ? new three.Vector3().subVectors(camera.position, anchor).normalize()
      : new three.Vector3(0, 0, 1);
    return createSyntheticHit(meshes[0], anchor, fallbackNormal, three);
  }

  function flattenCharmAttachNormal(normalWorld, worldPoint, camera, three) {
    const flat = normalWorld.clone();
    flat.y = 0;
    if (flat.lengthSq() > 1e-8) return flat.normalize();
    if (camera && worldPoint) {
      const toCamera = new three.Vector3().subVectors(camera.position, worldPoint);
      toCamera.y = 0;
      if (toCamera.lengthSq() > 1e-8) return toCamera.normalize();
    }
    return new three.Vector3(0, 0, 1);
  }

  function ensureOutwardNormal(normalWorld, worldPoint, camera, three) {
    const normal = normalWorld.clone().normalize();
    if (!camera || !worldPoint) {
      return normal;
    }
    const toCamera = new three.Vector3().subVectors(camera.position, worldPoint).normalize();
    if (normal.dot(toCamera) < 0) {
      normal.negate();
    }
    return normal;
  }

  function buildStickerQuaternionFromWorldNormal(normalWorld, targetMesh, three, camera, worldPoint) {
    const normal = ensureOutwardNormal(normalWorld.clone(), worldPoint, camera, three);
    const euler = buildDecalOrientation(normal, worldPoint, camera, three, 0);
    const worldQuat = new three.Quaternion().setFromEuler(euler);
    const parentQuat = new three.Quaternion();
    targetMesh.getWorldQuaternion(parentQuat);
    return parentQuat.invert().multiply(worldQuat);
  }

  function decalOrientationFromHit(hit, three) {
    const normal = worldNormalFromHit(hit, three);
    const position = hit.point.clone();
    const projector = new three.Object3D();
    projector.position.copy(position);
    projector.lookAt(position.clone().add(normal));
    return { position, normal, orientation: projector.rotation.clone() };
  }

  function buildDecalOrientation(normalWorld, worldPoint, camera, three, rotationDegrees = 0) {
    const normal = ensureOutwardNormal(normalWorld.clone(), worldPoint, camera, three);
    const worldUp = new three.Vector3(0, 1, 0);
    let stickerUp = worldUp.clone().sub(normal.clone().multiplyScalar(worldUp.dot(normal)));
    if (stickerUp.lengthSq() < 1e-5) {
      stickerUp = new three.Vector3(0, 0, 1).sub(normal.clone().multiplyScalar(normal.z));
    }
    if (stickerUp.lengthSq() < 1e-5) {
      stickerUp.set(0, 1, 0);
    } else {
      stickerUp.normalize();
    }

    let tangent = new three.Vector3().crossVectors(stickerUp, normal);
    if (tangent.lengthSq() < 1e-5) {
      tangent.set(1, 0, 0).cross(normal);
    }
    tangent.normalize();
    stickerUp = new three.Vector3().crossVectors(normal, tangent).normalize();

    const matrix = new three.Matrix4().makeBasis(tangent, stickerUp, normal);
    const euler = new three.Euler().setFromRotationMatrix(matrix);
    if (rotationDegrees) {
      euler.z += three.MathUtils.degToRad(rotationDegrees);
    }
    return euler;
  }

  function attachStickerFallbackPlane(modelRoot, hit, entry, stickerSize, three, slotIndex, options = {}) {
    const scrapeWear = Math.min(1, Math.max(0, Number(entry.wear) || 0));
    const wearScale = Math.max(0.82, 1 - scrapeWear * 0.12);
    const side = stickerSize * wearScale;
    const worldPoint = hit.point.clone();
    let normalWorld = worldNormalFromHit(hit, three);
    normalWorld = ensureOutwardNormal(normalWorld, worldPoint, options.camera || null, three);

    const stickerMeshes = collectStickerRaycastMeshes(modelRoot);
    const meshes = stickerMeshes.length ? stickerMeshes : [hit.object];
    const layerHits = collectStickerLayerHits(
      meshes,
      worldPoint,
      normalWorld,
      side,
      three,
      options.camera || null
    );
    const hits = layerHits.length ? layerHits : [hit];

    return loadCraftTexture(entry.image, three).then((texture) => {
      if (!texture || isCraftAttachStale(modelRoot, options)) return;
      const rotationDegrees = stickerRotationFromEntry(entry);
      hits.forEach((layerHit) => {
        if (isCraftAttachStale(modelRoot, options)) return;
        attachStickerPlaneOnHit(
          modelRoot,
          layerHit,
          texture,
          side,
          three,
          slotIndex,
          options,
          scrapeWear,
          rotationDegrees
        );
      });
    });
  }

  function attachStickerDecal(modelRoot, hit, entry, stickerSize, three, slotIndex, options = {}) {
    if (!hit?.object || shouldPreferStickerPlane(options) || typeof three.DecalGeometry !== "function") {
      return attachStickerFallbackPlane(modelRoot, hit, entry, stickerSize, three, slotIndex, options);
    }

    const scrapeWear = Math.min(1, Math.max(0, Number(entry.wear) || 0));
    const wearScale = Math.max(0.82, 1 - scrapeWear * 0.12);
    const side = stickerSize * wearScale;
    const worldPoint = hit.point.clone();
    let normalWorld = worldNormalFromHit(hit, three);
    normalWorld = ensureOutwardNormal(normalWorld, worldPoint, options.camera || null, three);
    const projectionDepth = Math.max(side * 0.55, 0.018);
    const decalSize = new three.Vector3(side, side, projectionDepth);
    const decalPosition = worldPoint.clone().addScaledVector(normalWorld, projectionDepth * 0.07);
    const rotationDegrees = stickerRotationFromEntry(entry);
    const decalOrientation = buildDecalOrientation(
      normalWorld,
      worldPoint,
      options.camera || null,
      three,
      rotationDegrees
    );

    const stickerMeshes = collectStickerRaycastMeshes(modelRoot);
    const targets = stickerMeshes.length ? stickerMeshes : [hit.object];
    modelRoot.updateMatrixWorld(true);
    targets.forEach((target) => target.updateMatrixWorld(true));

    return loadCraftTexture(entry.image, three).then((texture) => {
      if (!texture || isCraftAttachStale(modelRoot, options)) return;

      const attached = attachStickerDecalLayers(
        modelRoot,
        targets,
        decalPosition,
        decalOrientation,
        decalSize,
        texture,
        scrapeWear,
        options,
        slotIndex,
        three
      );

      if (!attached) {
        if (isCraftAttachStale(modelRoot, options)) return;
        return attachStickerFallbackPlane(modelRoot, hit, entry, stickerSize, three, slotIndex, options);
      }
    });
  }

  function computeCharmWorldFace(camera, worldPoint, three, options = {}) {
    // Slabs hang flat on the gun's side along the paint outward normal.
    // Dog-tags: face the camera (horizontal) so engraved text stays readable while
    // placing — outward-only facing hid the text on the far / underside of the gun.
    if (options.forSlab && options.outwardNormal) {
      const sideFace = options.outwardNormal.clone();
      sideFace.y = 0;
      if (sideFace.lengthSq() > 1e-8) return sideFace.normalize();
    }

    const face = new three.Vector3(0, 0, 1);
    if (!camera || !worldPoint || !three) return face;
    const camWorld = new three.Vector3();
    if (typeof camera.getWorldPosition === "function") camera.getWorldPosition(camWorld);
    else camWorld.copy(camera.position);
    face.subVectors(camWorld, worldPoint);
    // Keep upright — only yaw in the horizontal plane so hang stays gravity-down.
    face.y = 0;
    if (face.lengthSq() < 1e-8) face.set(0, 0, 1);
    else face.normalize();
    // Regular charms: 180° flip so the front reads correctly on the clasp.
    // Dog-tags already have text on +Z after alignDogTagHangDown — face the camera as-is.
    if (!options.forSlab && !options.forDogTag) face.negate();
    return face;
  }

  function applyCharmWorldLockedOrientation(anchor, three) {
    if (!anchor?.parent || !three) return;
    const faceStored = anchor.userData?.charmWorldFace;
    if (!faceStored) return;

    const upWorld = new three.Vector3(0, 1, 0);
    let face = faceStored.clone();
    face.addScaledVector(upWorld, -face.dot(upWorld));
    if (face.lengthSq() < 1e-8) face.set(0, 0, 1);
    else face.normalize();

    let right = new three.Vector3().crossVectors(upWorld, face);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    face = new three.Vector3().crossVectors(right, upWorld).normalize();

    const worldQuat = new three.Quaternion().setFromRotationMatrix(
      new three.Matrix4().makeBasis(right, upWorld, face)
    );
    const parentWorldQuat = new three.Quaternion();
    anchor.parent.getWorldQuaternion(parentWorldQuat);
    anchor.quaternion.copy(parentWorldQuat.clone().invert().multiply(worldQuat));
  }

  function computeCharmAnchorQuaternion(localNormal, three, targetMesh, camera, worldPoint, options = {}) {
    const inverse = new three.Matrix4().copy(targetMesh.matrixWorld).invert();
    const outward = localNormal.clone().normalize();

    // Hang with gravity in parent space (used only for the initial local pose).
    let hang = new three.Vector3(0, -1, 0).transformDirection(inverse).normalize();
    if (!options.forDogTag) {
      const alongOut = hang.dot(outward);
      if (alongOut < 0.12) {
        hang.addScaledVector(outward, 0.35 - Math.max(alongOut, 0));
        if (hang.lengthSq() < 1e-8) hang.copy(outward);
        else hang.normalize();
      }
      const intoGun = hang.dot(outward);
      if (intoGun < 0.08) {
        hang.addScaledVector(outward, 0.08 - intoGun);
        if (hang.lengthSq() < 1e-8) hang.copy(outward);
        else hang.normalize();
      }
    }
    const up = hang.clone().negate();

    // Dog-tags stay gun-relative: pin flush on the paint, tags hang down the slide.
    // Camera-facing here would yaw the clasp off the surface when you orbit.
    let face = null;
    if (!options.forDogTag && camera && worldPoint) {
      const worldFace = computeCharmWorldFace(camera, worldPoint, three);
      face = worldFace.clone().transformDirection(inverse);
      face.addScaledVector(up, -face.dot(up));
      if (face.lengthSq() > 1e-8) face.normalize();
      else face = null;
    }
    if (!face) {
      face = outward.clone().addScaledVector(up, -outward.dot(up));
      if (face.lengthSq() < 1e-8) {
        face = new three.Vector3(0, 0, 1).transformDirection(inverse);
        face.addScaledVector(up, -face.dot(up));
      }
      if (face.lengthSq() < 1e-8) face = new three.Vector3(0, 0, 1);
      else face.normalize();
    }

    let right = new three.Vector3().crossVectors(up, face);
    if (right.lengthSq() < 1e-8) {
      right.set(1, 0, 0).transformDirection(inverse);
      right.addScaledVector(up, -right.dot(up));
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    }
    right.normalize();
    face = new three.Vector3().crossVectors(right, up).normalize();

    return new three.Quaternion().setFromRotationMatrix(
      new three.Matrix4().makeBasis(right, up, face)
    );
  }

  function syncCharmAnchorsFaceCamera(resources, three) {
    // Keep charm facing fixed in world space so orbiting/rotating the gun shows its back.
    // Dog-tags skip this — camera yaw pulled the clasp off the paint.
    const modelRoot = resources?.modelRoot;
    if (!modelRoot || !three) return;
    const anchors = [];
    modelRoot.traverse((node) => {
      if (!node?.userData) return;
      if (node.userData.craftAttachment === "charm" || node.userData.craftPreview === "charm") {
        anchors.push(node);
      }
    });
    const preview = modelRoot.userData?.craftCharmPreviewAnchor;
    if (preview && !anchors.includes(preview)) anchors.push(preview);
    for (let i = 0; i < anchors.length; i += 1) {
      const anchor = anchors[i];
      if (anchor.userData?.charmIsHighlight) continue;
      applyCharmWorldLockedOrientation(anchor, three);
    }
  }

  function updateCharmAnchorFromHit(anchor, hit, charmSize, three, options = {}) {
    if (!anchor || !hit?.point) return;
    const camera = options.camera || null;
    // Parent to the weapon root — not skinned gun meshes (those often hide/clip children).
    const parent = options.modelRoot || hit.object;
    if (!parent) return;

    let normalWorld = ensureOutwardNormal(
      worldNormalFromHit(hit, three),
      hit.point,
      camera,
      three
    );
    // Side-facing attach only — pin on the paint, charm hangs world-down under the gun.
    normalWorld = flattenCharmAttachNormal(normalWorld, hit.point, camera, three);
    const inverse = new three.Matrix4().copy(parent.matrixWorld).invert();
    const localNormal = normalWorld.clone().transformDirection(inverse).normalize();
    const localPoint = hit.point.clone();
    parent.worldToLocal(localPoint);

    if (anchor.parent !== parent) {
      anchor.parent?.remove(anchor);
      parent.add(anchor);
    }

    anchor.visible = true;
    anchor.frustumCulled = false;
    anchor.position.copy(localPoint);
    const isSlab = Boolean(options.isSlab || anchor.userData?.charmIsSlab);
    const isHighlight = Boolean(options.isHighlightCharm || anchor.userData?.charmIsHighlight);
    // Pin tip on the paint — thin slab cards sit close; thick dog-tag clasp too.
    const keepNativeHoldPin = Boolean(options.keepNativeHoldPin);
    // Native-hold-pin workshop charms keep their modeled clasp (no kc_pin).
    // Seat the figurine outside the paint like Lil' SAS — import-origin / flush
    // tip buried it in the receiver.
    const nativeHoldStandoff = Math.max(charmSize * 0.18, 0.012);
    const tipStandoff = isSlab
      ? Math.max(charmSize * 0.008, 0.0006)
      : isHighlight
        // Dog-tags: clasp flush on the paint (large standoff floated the ring).
        ? Math.max(charmSize * 0.01, 0.0008)
        : keepNativeHoldPin
          ? nativeHoldStandoff
          : Math.max(charmSize * 0.005, 0.0005);
    if (tipStandoff > 0) {
      anchor.position.addScaledVector(localNormal, tipStandoff);
    }
    anchor.userData.charmLocalNormal = localNormal.clone();
    anchor.userData.charmSize = charmSize;
    anchor.userData.charmIsSlab = isSlab;
    anchor.userData.charmIsMissingLink = Boolean(options.isMissingLink);
    anchor.userData.charmIsHighlight = isHighlight;
    anchor.userData.charmIsGun = Boolean(options.isGunCharm);
    anchor.userData.charmIsGrenade = Boolean(options.isGrenadeCharm);
    // Character / sausage figurines (incl. Missing Link): crown-on-pin hang.
    anchor.userData.charmIsCharacter = Boolean(options.forCharacterCharm)
      || Boolean(options.forMissingLink)
      || keepNativeHoldPin
      || (
        Boolean(options.isMissingLink)
        && !isSlab
        && !isHighlight
        && !Boolean(options.isGunCharm)
        && !Boolean(options.isGrenadeCharm)
      );
    anchor.userData.keepNativeHoldPin = keepNativeHoldPin;
    anchor.userData.charmPinStandoff = tipStandoff;
    // Dog-tags stay glued to the slide: pin flush, hang down, no camera billboard.
    if (isHighlight) {
      anchor.userData.charmWorldFace = null;
      anchor.userData.charmWorldLocked = false;
      anchor.quaternion.copy(
        computeCharmAnchorQuaternion(localNormal, three, parent, camera, hit.point, { forDogTag: true })
      );
    } else {
      anchor.userData.charmWorldFace = computeCharmWorldFace(camera, hit.point, three, {
        forSlab: isSlab,
        forDogTag: false,
        outwardNormal: normalWorld,
      });
      anchor.userData.charmWorldLocked = true;
      applyCharmWorldLockedOrientation(anchor, three);
      if (!anchor.userData.charmWorldFace) {
        anchor.quaternion.copy(
          computeCharmAnchorQuaternion(localNormal, three, parent, camera, hit.point)
        );
      }
    }
    // Keep pin + charm one unit (no hang-body levitation). Extra clear pushes the whole keychain.
    clearCharmBodyFromGun(anchor, three, options);
  }

  function isUnderCharmPin(node) {
    let current = node;
    while (current) {
      if (current.userData?.standardCharmPin) return true;
      current = current.parent;
    }
    return false;
  }

  function nodeHasStandardCharmPin(node) {
    if (!node) return false;
    if (node.userData?.standardCharmPin) return true;
    let found = false;
    node.traverse?.((child) => {
      if (child.userData?.standardCharmPin) found = true;
    });
    return found;
  }

  function collectCharmBodyOffsetTargets(anchor) {
    if (!anchor) return [];
    const targets = new Set();

    // Pin + body siblings inside one wrap — offset only the hang body, not the pin.
    anchor.traverse((node) => {
      if (!node.userData?.charmHangBody || isUnderCharmPin(node)) return;
      const parent = node.parent;
      if (!parent) return;
      const pinSibling = parent.children.some((sibling) => (
        sibling !== node && nodeHasStandardCharmPin(sibling)
      ));
      if (pinSibling) targets.add(node);
    });
    if (targets.size) return [...targets];

    // Pin and hang chain are siblings under ringPivot — offset only the body pivot.
    const ringPivot = anchor.children[0];
    if (ringPivot) {
      const pinDirect = ringPivot.children.find((child) => nodeHasStandardCharmPin(child));
      const linkDirect = ringPivot.children.find((child) => child.userData?.charmHangBody);
      if (pinDirect && linkDirect) {
        const bodyDirect = linkDirect.children.find((child) => child.userData?.charmHangBody);
        return [bodyDirect || linkDirect];
      }
    }

    anchor.traverse((node) => {
      if (node.userData?.charmHangBody && !isUnderCharmPin(node) && node !== anchor) {
        targets.add(node);
      }
    });
    return [...targets];
  }

  function resetCharmBodyClearance(targets) {
    targets.forEach((target) => {
      const applied = Number(target.userData?.charmBodyClearanceApplied) || 0;
      const axis = target.userData?.charmBodyClearanceAxis;
      if (applied > 1e-6 && axis?.isVector3) {
        target.position.addScaledVector(axis, -applied);
      }
      target.userData.charmBodyClearanceApplied = 0;
      target.userData.charmBodyClearanceAxis = null;
    });
  }

  function measureCharmHangBodyWorldBox(targets, three) {
    const box = new three.Box3();
    if (!targets.length || !three) return box;
    targets.forEach((target) => {
      target.updateMatrixWorld(true);
      box.expandByObject(target);
    });
    return box;
  }

  function computeCharmBodyPushNormal(anchor, three) {
    const localNormal = anchor.userData?.charmLocalNormal;
    if (!localNormal || !anchor.parent) return null;
    // Push straight off the paint — no upward mix (that peeled flat backs off the gun).
    return localNormal.clone().normalize();
  }

  function sampleCharmHangBodyContactPoints(targets, three) {
    const box = measureCharmHangBodyWorldBox(targets, three);
    if (box.isEmpty()) return [];
    const min = box.min;
    const max = box.max;
    const mid = new three.Vector3();
    box.getCenter(mid);
    const xs = [min.x, mid.x, max.x];
    const ys = [min.y, mid.y, max.y];
    const zs = [min.z, mid.z, max.z];
    const points = [];
    xs.forEach((x) => {
      ys.forEach((y) => {
        zs.forEach((z) => {
          const onFace = (
            x === min.x || x === max.x
            || y === min.y || y === max.y
            || z === min.z || z === max.z
          );
          if (onFace) points.push(new three.Vector3(x, y, z));
        });
      });
    });
    points.push(mid);
    return points;
  }

  function computeCharmBodyGunClearance(anchor, targets, modelRoot, three) {
    const pushLocal = computeCharmBodyPushNormal(anchor, three);
    if (!pushLocal || !targets.length || !three) return 0;

    const parent = anchor.parent;
    if (!parent) return 0;

    parent.updateMatrixWorld(true);
    const worldPush = pushLocal.clone().transformDirection(parent.matrixWorld).normalize();

    const charmSize = Math.max(Number(anchor.userData?.charmSize) || 0.08, 0.04);
    const isSlab = Boolean(anchor.userData?.charmIsSlab);
    const isHighlight = Boolean(anchor.userData?.charmIsHighlight);
    // Keep a paint gap so slabs and figurines do not sink into the slide.
    // Dog-tags stay nearly flush so the chain connector reads attached.
    const minOutward = isSlab
      ? Math.max(charmSize * 0.04, 0.0032)
      : isHighlight
        ? Math.max(charmSize * 0.005, 0.0004)
        : Math.max(charmSize * 0.022, 0.002);

    const samples = sampleCharmHangBodyContactPoints(targets, three);
    if (!samples.length) return 0;

    const gunMeshes = modelRoot ? collectCraftRaycastMeshes(modelRoot) : [];
    if (!gunMeshes.length) {
      anchor.userData.charmBodyPushLocal = pushLocal.clone();
      return 0;
    }

    prepareCraftRaycastMeshes(gunMeshes);
    const raycaster = new three.Raycaster();
    const inward = worldPush.clone().negate();
    const search = Math.max(charmSize * 1.2, 0.07);
    let maxPush = 0;

    samples.forEach((sample) => {
      // Cast from outside the gun so clipped samples still find the paint surface.
      const origin = sample.clone().addScaledVector(worldPush, search);
      raycaster.set(origin, inward);
      raycaster.far = search * 2.1;
      raycaster.near = 0;
      const hits = raycaster.intersectObjects(gunMeshes, false);
      if (!hits.length) return;
      const surface = hits[0].point;
      const outside = sample.clone().sub(surface).dot(worldPush);
      // Only push when actually in/through the gun — never for free space.
      if (outside < minOutward) {
        maxPush = Math.max(maxPush, minOutward - outside);
      }
    });

    anchor.userData.charmBodyPushLocal = pushLocal.clone();
    // Cap so pin and charm stay connected, but allow enough push to clear thick bodies.
    return Math.min(maxPush, charmSize * (isSlab ? 0.22 : 0.3));
  }

  function resetCharmBodyDeflectionTilt(targets) {
    targets.forEach((target) => {
      const base = target.userData?.charmDeflectBaseQuat;
      if (base?.isQuaternion) {
        target.quaternion.copy(base);
      }
      target.userData.charmDeflectTiltApplied = 0;
    });
  }

  function applyCharmBodyClearance(target, anchor, offset, three) {
    if (!target || !anchor || offset <= 1e-6 || !three) return;
    const pushLocal = anchor.userData?.charmBodyPushLocal || anchor.userData?.charmLocalNormal;
    const parent = target.parent;
    if (!pushLocal || !parent) return;

    anchor.parent?.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);
    const worldPush = pushLocal.clone().transformDirection(anchor.parent.matrixWorld).normalize();
    const inverse = new three.Matrix4().copy(parent.matrixWorld).invert();
    const axis = worldPush.clone().transformDirection(inverse).normalize();
    target.position.addScaledVector(axis, offset);
    target.userData.charmBodyClearanceApplied = offset;
    target.userData.charmBodyClearanceAxis = axis.clone();
    target.updateMatrixWorld(true);
  }

  function hardenCharmBodyAgainstGunClip(root) {
    if (!root) return;
    root.traverse((node) => {
      if (isUnderCharmPin(node)) return;
      if (!(node.isMesh || node.isSkinnedMesh) || !node.material) return;
      if (!node.userData?.charmHangBody && !node.userData?.hangArt && !node.userData?.slabStickerFace) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        const isBody = materials.some((material) => (
          CHARM_BODY_MATERIAL_RE.test(String(material?.name || "").toLowerCase())
        ));
        if (!isBody) return;
      }
      node.renderOrder = Math.max(Number(node.renderOrder) || 0, 72);
      node.frustumCulled = false;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        if (!material) return;
        material.depthTest = true;
        material.depthWrite = true;
        material.polygonOffset = true;
        material.polygonOffsetFactor = 1.5;
        material.polygonOffsetUnits = 1.5;
        material.needsUpdate = true;
      });
    });
  }

  function charmHangSeatY(pin, charmSize, options = {}) {
    const size = Math.max(Number(charmSize) || 0.08, 0.04);
    const tipY = Number.isFinite(pin?.tipY) ? pin.tipY : 0;
    const bottomY = Number.isFinite(pin?.bottomY) ? pin.bottomY : -size * 0.2;
    const pinSpan = Math.max(Math.abs(tipY - bottomY), size * 0.12);

    // Slab tip rivet (no circle): nest the eyelet on the pad.
    if (pin?.group?.userData?.slabTipPin || options.forSlab) {
      const rivetY = Number.isFinite(pin?.bottomY) ? pin.bottomY : -Math.max(size * 0.006, 0.0008);
      return rivetY + Math.max(size * 0.006, 0.0005);
    }

    // Sausage / sauce: head eyelet threads the holding ring (no air gap).
    // Other figurines keep a hang gap so the pin does not spear a comb/hat.
    if (options.sausageLatch) {
      const seatY = Number.isFinite(pin?.seatY)
        ? pin.seatY
        : (bottomY + Math.max(pinSpan * 0.16, size * 0.016));
      const latch = Math.max(pinSpan * 0.16, size * 0.02);
      return Math.max(seatY + latch, bottomY + pinSpan * 0.28);
    }

    // Hang-from-pin: crown / screw-eye latches in the split-ring (small overlap OK).
    // Do not drop a full ring-height below bottomY — that reads as a dangling wire.
    const hangFromPin = Boolean(
      options.hangFromPin
      || options.missingLinkLatch
      || pin?.group?.userData?.cs2GoldLinkPin
      || pin?.group?.userData?.cs2CharmHardwarePin
    );
    if (hangFromPin) {
      const seatY = Number.isFinite(pin?.seatY)
        ? pin.seatY
        : (bottomY + Math.max(pinSpan * 0.18, size * 0.016));
      const nest = Math.max(pinSpan * 0.08, size * 0.006);
      return seatY + nest;
    }

    // Grenade / torus ring: light hook under the circle, not a deep crown nest.
    let seatY = Number.isFinite(pin?.seatY)
      ? pin.seatY
      : (bottomY + Math.max(pinSpan * 0.16, size * 0.016));
    const latch = options.deepLatch
      ? Math.max(pinSpan * 0.18, size * 0.022)
      : Math.max(pinSpan * 0.12, size * 0.016);
    const hangY = seatY + latch;
    const highRing = bottomY + pinSpan * (options.deepLatch ? 0.28 : 0.18);
    return Math.max(hangY, highRing);
  }

  function clearCharmBodyFromGun(anchor, three, options = {}) {
    if (!anchor || !three) return;
    const modelRoot = options.modelRoot || anchor.parent || null;
    const localNormal = anchor.userData?.charmLocalNormal;
    if (!localNormal) return;

    const hangTargets = collectCharmBodyOffsetTargets(anchor);
    resetCharmBodyClearance(hangTargets);
    resetCharmBodyDeflectionTilt(hangTargets);

    // Undo any prior whole-anchor shove so the pin/clasp tip stays on the paint.
    const already = Number(anchor.userData?.charmUnitClearanceApplied) || 0;
    if (already > 1e-6) {
      anchor.position.addScaledVector(localNormal, -already);
      anchor.userData.charmUnitClearanceApplied = 0;
      const tip = Number(anchor.userData?.charmPinStandoff) || 0;
      anchor.userData.charmPinStandoff = Math.max(tip - already, 0);
    }

    const charmSize = Math.max(Number(anchor.userData?.charmSize) || 0.08, 0.04);
    const isSlab = Boolean(anchor.userData?.charmIsSlab);
    const hasSeparatePin = Boolean(
      hangTargets.length
      && (
        nodeHasStandardCharmPin(anchor)
        || anchor.children.some((child) => nodeHasStandardCharmPin(child))
      )
    );

    // No separate pin — only a hair of whole-unit lift when deeply buried.
    if (!hasSeparatePin) {
      const needed = computeCharmBodyGunClearance(
        anchor,
        hangTargets.length ? hangTargets : [anchor],
        modelRoot,
        three
      );
      const isNativeHold = Boolean(
        options.keepNativeHoldPin || anchor.userData?.keepNativeHoldPin
      );
      // Native-hold-pin: hang is already off the paint; only push more if still intersecting.
      const unitPush = isNativeHold
        ? Math.min(Math.max(needed * 0.9, 0), charmSize * 0.18)
        : Math.min(Math.max(needed * 0.25, 0), charmSize * 0.035);
      if (unitPush > 1e-6) {
        anchor.position.addScaledVector(localNormal, unitPush);
        anchor.userData.charmUnitClearanceApplied = unitPush;
        anchor.userData.charmPinStandoff = (Number(anchor.userData.charmPinStandoff) || 0) + unitPush;
      }
      hangTargets.forEach((target) => hardenCharmBodyAgainstGunClip(target));
      hardenCharmBodyAgainstGunClip(anchor);
      return;
    }

    const needed = computeCharmBodyGunClearance(anchor, hangTargets, modelRoot, three);
    if (needed > 1e-6) {
      const isHighlight = Boolean(options.isHighlightCharm || anchor.userData?.charmIsHighlight);
      const isGunCharm = Boolean(options.isGunCharm || anchor.userData?.charmIsGun);
      // Dog-tags / gun charms: keep the clasp on the paint — never shove the whole
      // keychain out (that floated tags under the barrel with a visible air gap).
      if (isHighlight || isGunCharm) {
        hangTargets.forEach((target) => hardenCharmBodyAgainstGunClip(target));
        hardenCharmBodyAgainstGunClip(anchor);
        return;
      }
      // Slabs: pin stays on the paint; nudge the plate out just enough to sit above
      // the receiver (connected, no diving-board levitation, no mesh clip).
      if (isSlab) {
        const hangPush = Math.min(needed, charmSize * 0.1);
        if (hangPush > 1e-6) {
          hangTargets.forEach((target) => {
            applyCharmBodyClearance(target, anchor, hangPush, three);
          });
        }
        const residual = computeCharmBodyGunClearance(anchor, hangTargets, modelRoot, three);
        if (residual > charmSize * 0.006) {
          const unitPush = Math.min(residual * 0.9, charmSize * 0.05);
          if (unitPush > 1e-6) {
            anchor.position.addScaledVector(localNormal, unitPush);
            anchor.userData.charmUnitClearanceApplied = unitPush;
            anchor.userData.charmPinStandoff = (Number(anchor.userData.charmPinStandoff) || 0) + unitPush;
          }
        }
        hangTargets.forEach((target) => hardenCharmBodyAgainstGunClip(target));
        hardenCharmBodyAgainstGunClip(anchor);
        return;
      }
      // Character / sausage: never shove the hang body sideways off the pin — that
      // spears the shaft through the side of the head and reads as a ~45° lean.
      // Keep crown on the pin axis; nudge the whole keychain out just enough.
      const isCharacter = Boolean(
        options.forCharacterCharm
        || options.isMissingLink
        || anchor.userData?.charmIsCharacter
        || anchor.userData?.charmIsMissingLink
      );
      if (isCharacter) {
        const unitPush = Math.min(Math.max(needed * 0.85, 0), charmSize * 0.14);
        if (unitPush > 1e-6) {
          anchor.position.addScaledVector(localNormal, unitPush);
          anchor.userData.charmUnitClearanceApplied = unitPush;
          anchor.userData.charmPinStandoff = (Number(anchor.userData.charmPinStandoff) || 0) + unitPush;
        }
        hangTargets.forEach((target) => hardenCharmBodyAgainstGunClip(target));
        hardenCharmBodyAgainstGunClip(anchor);
        return;
      }
      // Contact push on the hang body — pin stays on the paint, body clears the slide.
      const hangPush = Math.min(needed, charmSize * 0.26);
      hangTargets.forEach((target) => {
        applyCharmBodyClearance(target, anchor, hangPush, three);
      });
      // Second pass if still intersecting (thick figurines into the slide).
      const residual = computeCharmBodyGunClearance(anchor, hangTargets, modelRoot, three);
      if (residual > charmSize * 0.01) {
        const extra = Math.min(residual, charmSize * 0.12);
        hangTargets.forEach((target) => {
          const prior = Number(target.userData?.charmBodyClearanceApplied) || 0;
          resetCharmBodyClearance([target]);
          applyCharmBodyClearance(target, anchor, Math.min(prior + extra, charmSize * 0.32), three);
        });
      }
    }

    hangTargets.forEach((target) => hardenCharmBodyAgainstGunClip(target));
    hardenCharmBodyAgainstGunClip(anchor);
  }

  function prepareSlabStickerMap(texture, three) {
    if (!texture || !three) return null;
    // Prefer an already-baked canvas map; otherwise bake now so WebGL never sees a tainted Steam image.
    if (texture.userData?.craftBaked || texture.isCanvasTexture) {
      texture.encoding = three.sRGBEncoding;
      if ("colorSpace" in texture && three.SRGBColorSpace) {
        texture.colorSpace = three.SRGBColorSpace;
      }
      texture.flipY = true;
      texture.needsUpdate = true;
      return texture;
    }
    return bakeCraftTextureForMesh(texture, three) || texture;
  }

  /**
   * Slab-only loader: fetch same-origin proxy as blob → Image → CanvasTexture.
   * TextureLoader + Steam CDN was leaving gold/foil/glitter slabs black (tainted / empty GPU uploads).
   */
  function loadSlabTexture(imageUrl, three) {
    const primaryUrl = resolveCraftImageUrl(imageUrl);
    if (!primaryUrl || !three) return Promise.resolve(null);

    const cacheKey = `slab:${primaryUrl}`;
    const cached = craftTextureCache.get(cacheKey);
    if (cached) return Promise.resolve(cached);

    const fetchUrl = primaryUrl + (primaryUrl.includes("?") ? "&" : "?") + "_slabtex=1";

    const bakeFromImage = (img) => {
      const w = Math.max(1, Number(img.naturalWidth || img.width || 0));
      const h = Math.max(1, Number(img.naturalHeight || img.height || 0));
      if (!w || !h) return null;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: true });
      if (!ctx) return null;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      // Reject empty / near-black uploads so we can fall back cleanly.
      try {
        const stepX = Math.max(1, Math.floor(w / 24));
        const stepY = Math.max(1, Math.floor(h / 24));
        let visible = 0;
        let lumSum = 0;
        for (let y = 0; y < h; y += stepY) {
          for (let x = 0; x < w; x += stepX) {
            const px = ctx.getImageData(x, y, 1, 1).data;
            if (px[3] < 24) continue;
            visible += 1;
            lumSum += (px[0] * 0.299) + (px[1] * 0.587) + (px[2] * 0.114);
          }
        }
        if (visible < 4) return null;
        const avgLum = lumSum / visible;
        // Pure black stickers are extremely rare; treat near-zero as a failed decode.
        if (avgLum < 2.5) return null;
      } catch (_error) {
        // SecurityError on tainted canvas — treat as failure.
        return null;
      }

      const texture = new three.CanvasTexture(canvas);
      texture.encoding = three.sRGBEncoding;
      if ("colorSpace" in texture && three.SRGBColorSpace) {
        texture.colorSpace = three.SRGBColorSpace;
      }
      texture.flipY = true;
      texture.generateMipmaps = true;
      texture.minFilter = three.LinearMipmapLinearFilter || three.LinearFilter;
      texture.magFilter = three.LinearFilter;
      texture.needsUpdate = true;
      texture.userData = { ...(texture.userData || {}), craftBaked: true, slabTexture: true };
      return texture;
    };

    const loadImageFromObjectUrl = (objectUrl) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const baked = bakeFromImage(img);
        URL.revokeObjectURL(objectUrl);
        if (baked) resolve(baked);
        else reject(new Error("slab bake empty"));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("slab image decode failed"));
      };
      img.src = objectUrl;
    });

    return fetch(fetchUrl, { cache: "no-store", credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error(`slab fetch ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (!blob || !blob.size) throw new Error("slab empty blob");
        return loadImageFromObjectUrl(URL.createObjectURL(blob));
      })
      .then((texture) => {
        craftTextureCache.set(cacheKey, texture);
        return texture;
      })
      .catch(() => (
        // Last resort: TextureLoader path, then force canvas bake.
        loadCraftTexture(imageUrl, three).then((texture) => {
          const baked = prepareSlabStickerMap(texture, three);
          if (baked) {
            craftTextureCache.set(cacheKey, baked);
            return baked;
          }
          return null;
        })
      ));
  }

  function makeSlabFaceMaterial(map, three, previewOpacity) {
    if (map) {
      return new three.MeshBasicMaterial({
        map,
        color: 0xffffff,
        transparent: true,
        opacity: previewOpacity,
        alphaTest: 0.04,
        side: three.FrontSide,
        depthTest: true,
        depthWrite: true,
      });
    }
    return new three.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: Math.min(previewOpacity, 0.7),
      side: three.FrontSide,
      depthWrite: true,
    });
  }

  /**
   * Sticker slab card: tip rivet + double-sided Steam slab art planes.
   * (Pre-header / pre-graded-case path — no header plate mesh or 3D shell.)
   */
  function buildSlabCharmVisual(texture, charmSize, three, options = {}) {
    const isPreview = Boolean(options.isPreview);
    const previewOpacity = isPreview ? 0.92 : 1;
    const size = Math.max(Number(charmSize) || 0.08, 0.04);

    const ringPivot = new three.Group();
    const linkPivot = new three.Group();
    const bodyPivot = new three.Group();
    ringPivot.userData.craftPart = true;
    // Holds the pin flush on the paint — never simulated (see createCharmJigglePhysics).
    ringPivot.userData.charmRigidPin = true;
    linkPivot.userData.craftPart = true;
    linkPivot.userData.charmHangBody = true;
    bodyPivot.userData.craftPart = true;
    bodyPivot.userData.charmHangBody = true;

    const pin = buildStandardCharmPin(three, size, isPreview, { forSlab: true });
    ringPivot.add(pin.group);
    linkPivot.position.y = charmHangSeatY(pin, size, { forSlab: true });

    const map = prepareSlabStickerMap(texture, three) || texture || null;
    const img = map?.image;
    const imgW = Number(img?.naturalWidth || img?.width || 0);
    const imgH = Number(img?.naturalHeight || img?.height || 0);
    // Slabs are passed 1.4× layout.charmSize; dog-tags fit to ~2.15×. Scale the
    // card so hang length / bulk matches tournament tags on the same gun.
    const tagLike = size * 1.65;
    let bodyWidth = tagLike * 1.08;
    let bodyHeight = tagLike * 0.82;
    if (imgW > 0 && imgH > 0) {
      const aspect = imgW / Math.max(imgH, 1);
      bodyWidth = tagLike * 1.08;
      bodyHeight = bodyWidth / Math.max(aspect, 0.55);
      bodyHeight = Math.min(Math.max(bodyHeight, tagLike * 0.68), tagLike * 1.05);
    }
    const bodyDepth = size * 0.01;

    const bodyGroup = new three.Group();
    bodyGroup.userData.craftPart = true;
    bodyGroup.userData.charmHangBody = true;

    const faceMat = makeSlabFaceMaterial(map, three, previewOpacity);
    const backMat = makeSlabFaceMaterial(map, three, previewOpacity);

    const bodyFront = new three.Mesh(
      new three.PlaneGeometry(bodyWidth, bodyHeight),
      faceMat
    );
    bodyFront.userData.craftPart = true;
    bodyFront.userData.slabStickerFace = true;
    bodyFront.userData.charmHangBody = true;
    // Front faces out along the gun-side normal; hang down in local -Y (world gravity)
    // so the card rests against the slide like CS2 dog-tags — not a camera billboard.
    bodyFront.position.set(0, -bodyHeight * 0.5, bodyDepth);
    bodyFront.renderOrder = 70;
    bodyFront.frustumCulled = false;

    const bodyBack = new three.Mesh(
      new three.PlaneGeometry(bodyWidth, bodyHeight),
      backMat
    );
    bodyBack.userData.craftPart = true;
    bodyBack.userData.slabStickerFace = true;
    bodyBack.userData.charmHangBody = true;
    bodyBack.position.set(0, -bodyHeight * 0.5, 0.0003);
    bodyBack.rotation.y = Math.PI;
    bodyBack.renderOrder = 70;
    bodyBack.frustumCulled = false;

    bodyGroup.add(bodyFront, bodyBack);
    // Lift card so the painted eyelet seats on the tip rivet.
    bodyPivot.position.y = bodyHeight * 0.14;
    bodyPivot.add(bodyGroup);
    linkPivot.add(bodyPivot);
    ringPivot.add(linkPivot);

    return { ringPivot, linkPivot, bodyPivot };
  }

  function buildCharmVisualGroup(texture, charmSize, three, options = {}) {
    const isPreview = Boolean(options.isPreview);
    const isSlab = Boolean(options.isSlab);
    if (isSlab) {
      return buildSlabCharmVisual(texture, charmSize, three, options);
    }
    const previewOpacity = isPreview ? 0.88 : 1;
    const size = Math.max(Number(charmSize) || 0.08, 0.04);

    const ringPivot = new three.Group();
    const linkPivot = new three.Group();
    const bodyPivot = new three.Group();
    ringPivot.userData.craftPart = true;
    // Holds the pin flush on the paint — never simulated (see createCharmJigglePhysics).
    ringPivot.userData.charmRigidPin = true;
    linkPivot.userData.craftPart = true;
    bodyPivot.userData.craftPart = true;

    const pin = buildStandardCharmPin(three, size, isPreview, { forCharacterCharm: true });
    ringPivot.add(pin.group);
    // Seat the charm top flush against the circle — no air gap / levitation.
    linkPivot.position.y = charmHangSeatY(pin, size);
    bodyPivot.position.y = 0;
    linkPivot.userData.charmHangBody = true;
    bodyPivot.userData.charmHangBody = true;

    const bodyGroup = new three.Group();
    bodyGroup.userData.craftPart = true;

    {
      const edgeMat = new three.MeshBasicMaterial({
        color: 0x2a3344,
        transparent: isPreview,
        opacity: previewOpacity,
        depthWrite: true,
      });
      const faceMat = texture
        ? new three.MeshBasicMaterial({
          map: prepareCharmFigurineTexture(texture, three) || texture,
          color: 0xffffff,
          transparent: true,
          opacity: previewOpacity,
          alphaTest: 0.12,
          side: three.DoubleSide,
          depthWrite: true,
        })
        : edgeMat;
      const bodyWidth = size * 0.58;
      const bodyHeight = size * 0.74;
      const bodyDepth = size * 0.09;
      const figurine = buildBallCharmFigurine(texture, bodyWidth, bodyHeight, three, isPreview);
      if (figurine?.mesh) {
        figurine.mesh.position.y = -bodyHeight * 0.5;
        bodyGroup.add(figurine.mesh);
      } else {
        const bodyShell = new three.Mesh(
          new three.SphereGeometry(Math.max(bodyWidth, bodyHeight) * 0.42, 24, 16),
          edgeMat
        );
        bodyShell.userData.craftPart = true;
        bodyShell.scale.set(1, 1.1, 0.78);
        bodyShell.position.y = -bodyHeight * 0.5;
        bodyGroup.add(bodyShell);

        const bodyFront = new three.Mesh(
          new three.PlaneGeometry(bodyWidth, bodyHeight),
          faceMat
        );
        bodyFront.userData.craftPart = true;
        bodyFront.position.set(0, -bodyHeight * 0.5, bodyDepth * 2);
        bodyGroup.add(bodyFront);
      }
    }

    linkPivot.add(bodyPivot);
    bodyPivot.add(bodyGroup);
    ringPivot.add(linkPivot);
    bodyGroup.traverse((node) => {
      if (node.isMesh) {
        node.renderOrder = node.userData?.slabStickerFace ? 70 : 50;
        node.frustumCulled = false;
        node.visible = true;
      }
    });

    return { ringPivot, linkPivot, bodyPivot };
  }

  function isCraftAttachStale(modelRoot, options = {}) {
    const generation = options.syncGeneration;
    if (generation == null || !modelRoot) return false;
    const key = options.isPreview ? "craftPreviewGeneration" : "craftSyncGeneration";
    return modelRoot.userData[key] !== generation;
  }

  function isCharmAttachStale(modelRoot, options = {}) {
    return isCraftAttachStale(modelRoot, options);
  }

  function resolveCharmPreviewKey(entry) {
    const image = String(entry?.image || "");
    return `${image}|gltf`;
  }

  function resolveCharmModelUrl(entry) {
    if (!entry) return null;
    const custom = String(entry.model3d || entry.gltf || entry.model_url || "").trim();
    const isSlab = String(entry.market_hash_name || "").startsWith("Sticker Slab |");
    if (isSlab) return custom || SLAB_GLB_DEFAULT;
    // Charms use the unique CS2 keychain GLTF when provided.
    return custom || CHARM_GLB_DEFAULT;
  }

  function prepareCharmPinFittedTemplate(gltf, three) {
    if (charmPinFittedTemplate) return charmPinFittedTemplate;
    if (!gltf?.scene || !three) return null;

    const source = three.SkeletonUtils?.clone
      ? three.SkeletonUtils.clone(gltf.scene)
      : gltf.scene.clone(true);
    if (!source) return null;

    // CS2 weapon chain hangs along -Z; viewer charm space hangs along -Y.
    source.rotation.x = -Math.PI / 2;
    source.updateMatrixWorld(true);

    const box = new three.Box3().setFromObject(source);
    if (box.isEmpty()) return null;
    const size = box.getSize(new three.Vector3());
    const unitScale = 1 / Math.max(size.y, size.z, 0.001);
    source.scale.multiplyScalar(unitScale);
    source.updateMatrixWorld(true);

    const fitted = new three.Box3().setFromObject(source);
    const attach = new three.Vector3(
      (fitted.min.x + fitted.max.x) * 0.5,
      fitted.max.y,
      (fitted.min.z + fitted.max.z) * 0.5
    );
    source.worldToLocal(attach);
    source.position.sub(attach);
    source.updateMatrixWorld(true);

    fortifyCharmGltfClone(source, three);
    sanitizeCharmGltfMaterials(source, three, false);
    source.traverse((node) => {
      node.userData.craftPart = true;
      node.userData.standardCharmPin = true;
      node.frustumCulled = false;
      if (!(node.isMesh || node.isSkinnedMesh) || !node.material) return;
      node.renderOrder = 66;
      node.visible = true;
    });

    charmPinFittedTemplate = source;
    return charmPinFittedTemplate;
  }

  function loadCharmPinTemplate(three) {
    if (charmPinFittedTemplate) return Promise.resolve(charmPinFittedTemplate);
    if (charmPinTemplatePromise) return charmPinTemplatePromise;
    if (!window.THREE?.GLTFLoader || !three) return Promise.resolve(null);

    charmPinTemplatePromise = new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = window.setTimeout(() => finish(null), 8000);
      const loader = new window.THREE.GLTFLoader();
      loader.load(
        CHARM_PIN_GLTF,
        (gltf) => {
          window.clearTimeout(timer);
          const fitted = prepareCharmPinFittedTemplate(gltf, three);
          if (!fitted) {
            charmPinTemplatePromise = null;
            finish(null);
            return;
          }
          finish(fitted);
        },
        undefined,
        () => {
          window.clearTimeout(timer);
          charmPinTemplatePromise = null;
          finish(null);
        }
      );
    });
    return charmPinTemplatePromise;
  }

  function seatCharmPinTipFlush(group, three) {
    if (!group || !three) return;
    group.updateMatrixWorld(true);
    const box = new three.Box3().setFromObject(group);
    if (box.isEmpty() || !Number.isFinite(box.max.y)) return;
    // Tip contact at y = 0 on the OUTSIDE of the gun (standoff handles surface clear).
    // Never push tip past 0 into +Y — that shoves the clasp into the paint.
    group.position.y -= box.max.y;
    group.updateMatrixWorld(true);
  }

  function hardenCharmPinAgainstGunClip(group) {
    if (!group) return;
    group.traverse((node) => {
      node.frustumCulled = false;
      node.userData.craftPart = true;
      node.userData.standardCharmPin = true;
      if (!(node.isMesh || node.isSkinnedMesh) || !node.material) return;
      node.renderOrder = 68;
      node.visible = true;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        if (!material) return;
        material.depthTest = true;
        material.depthWrite = true;
        material.polygonOffset = true;
        material.polygonOffsetFactor = -2;
        material.polygonOffsetUnits = -2;
        material.needsUpdate = true;
      });
    });
  }

  function buildSlabCharmPin(three, charmSize, isPreview = false) {
    const size = Math.max(Number(charmSize) || 0.08, 0.04);
    const previewOpacity = isPreview ? 0.9 : 1;
    // Slabs: tiny tip+rivet only — no ring / circle (Steam art already has the eyelet).
    const gunMetal = new three.MeshBasicMaterial({
      color: 0x6b7280,
      transparent: isPreview,
      opacity: previewOpacity,
      depthWrite: true,
    });
    const brass = new three.MeshBasicMaterial({
      color: 0xb8c0c8,
      transparent: isPreview,
      opacity: previewOpacity,
      depthWrite: true,
    });

    const group = new three.Group();
    group.userData.craftPart = true;
    group.userData.standardCharmPin = true;
    group.userData.slabTipPin = true;

    const tipR = size * 0.011;
    const pegLen = size * 0.004;
    const tip = new three.Mesh(new three.SphereGeometry(tipR, 12, 10), brass);
    tip.userData.craftPart = true;
    tip.position.y = 0;

    const peg = new three.Mesh(
      new three.CylinderGeometry(size * 0.007, size * 0.008, pegLen, 10),
      gunMetal
    );
    peg.userData.craftPart = true;
    peg.position.y = -pegLen * 0.5;

    // Flat rivet under the tip — slab eyelet seats flush here.
    const rivet = new three.Mesh(
      new three.CylinderGeometry(size * 0.012, size * 0.012, size * 0.004, 12),
      gunMetal
    );
    rivet.userData.craftPart = true;
    rivet.position.y = -pegLen;

    group.add(tip, peg, rivet);
    hardenCharmPinAgainstGunClip(group);

    const bottomY = -pegLen - size * 0.001;
    return {
      group,
      bottomY,
      tipY: 0,
      seatY: -tipR * 0.35,
    };
  }

  function makeCharmPinMetalMaterial(three, color, isPreview = false, options = {}) {
    const opacity = isPreview ? 0.9 : 1;
    if (three.MeshStandardMaterial) {
      return new three.MeshStandardMaterial({
        color,
        metalness: options.metalness ?? 0.82,
        roughness: options.roughness ?? 0.4,
        emissive: options.emissive ?? 0x000000,
        emissiveIntensity: options.emissiveIntensity ?? 0,
        envMapIntensity: options.envMapIntensity ?? 1,
        transparent: isPreview,
        opacity,
        depthWrite: true,
      });
    }
    return new three.MeshBasicMaterial({
      color,
      transparent: isPreview,
      opacity,
      depthWrite: true,
    });
  }

  /**
   * Chrome split-ring (mini keyring): helical tube so the wire overlaps
   * instead of a closed 2D torus.
   */
  function buildCharmSplitRingGeometry(three, radius, tubeR, turns = 1.34) {
    const pts = [];
    const steps = 56;
    const zSpan = tubeR * 1.85;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      // Start at 12 o'clock so the split sits under the clasp.
      const angle = (t * Math.PI * 2 * turns) + (Math.PI * 0.5);
      pts.push(new three.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        (t - 0.5) * zSpan
      ));
    }
    const curve = new three.CatmullRomCurve3(pts, false, "catmullrom", 0.12);
    const geometry = new three.TubeGeometry(curve, steps, tubeR, 12, false);
    return { geometry, start: pts[0], end: pts[pts.length - 1] };
  }

  /**
   * CS2 character-charm holding pin (Missing Link / sausage inspect):
   * dark top loop + gold collar + slotted gunmetal swivel nested in the
   * chrome split-ring, plus a silver screw-eye on the lower arc.
   * Ring envelope matches the old torus so the gun eyelet stays flush.
   */
  function buildCs2CharmHardwarePin(three, charmSize, isPreview = false) {
    const size = Math.max(Number(charmSize) || 0.08, 0.04);

    const gunmetal = makeCharmPinMetalMaterial(three, 0x3a414a, isPreview, {
      metalness: 0.62,
      roughness: 0.4,
      emissive: 0x121416,
      emissiveIntensity: 0.12,
    });
    const gunmetalDark = makeCharmPinMetalMaterial(three, 0x262c33, isPreview, {
      metalness: 0.55,
      roughness: 0.48,
      emissive: 0x0c0e10,
      emissiveIntensity: 0.08,
    });
    const gold = makeCharmPinMetalMaterial(three, 0xd4aa2a, isPreview, {
      metalness: 0.74,
      roughness: 0.22,
      emissive: 0x3a2808,
      emissiveIntensity: 0.18,
    });
    const chrome = makeCharmPinMetalMaterial(three, 0xd8dee6, isPreview, {
      metalness: 0.78,
      roughness: 0.14,
      emissive: 0x1c2026,
      emissiveIntensity: 0.14,
    });
    const silver = makeCharmPinMetalMaterial(three, 0xc8ced6, isPreview, {
      metalness: 0.72,
      roughness: 0.2,
      emissive: 0x181c20,
      emissiveIntensity: 0.1,
    });

    const group = new three.Group();
    group.userData.craftPart = true;
    group.userData.standardCharmPin = true;
    group.userData.cs2CharmHardwarePin = true;

    // Same ring envelope as the old torus / grenade pin (flush on the slide).
    const pegLen = size * 0.012;
    const ringR = size * 0.078;
    const ringTube = size * 0.028;
    const ringCenterY = -(pegLen + ringR - ringTube * 0.35);
    const ringSeatY = ringCenterY - ringR * 0.15;
    const ringBottomY = ringCenterY - ringR - ringTube * 0.1;

    // 1) Compact dark top loop at the gun — nest into the ring, no tall stem.
    const loopR = size * 0.014;
    const tip = new three.Mesh(new three.SphereGeometry(size * 0.011, 12, 10), gunmetalDark);
    tip.userData.craftPart = true;
    tip.position.y = 0;

    const topLoop = new three.Mesh(
      new three.TorusGeometry(loopR, size * 0.0065, 10, 22),
      gunmetalDark
    );
    topLoop.userData.craftPart = true;
    topLoop.position.y = -loopR * 0.25;

    // 2) Polished gold collar inside the upper ring.
    const goldH = size * 0.012;
    const goldR = size * 0.022;
    const goldY = -loopR * 1.7 - goldH * 0.4;
    const goldBand = new three.Mesh(
      new three.CylinderGeometry(goldR * 0.96, goldR, goldH, 16),
      gold
    );
    goldBand.userData.craftPart = true;
    goldBand.position.y = goldY;

    const goldLip = new three.Mesh(
      new three.TorusGeometry(goldR * 0.96, size * 0.0028, 8, 18),
      gold
    );
    goldLip.userData.craftPart = true;
    goldLip.rotation.x = Math.PI / 2;
    goldLip.position.y = goldY + goldH * 0.38;

    // 3) Short gunmetal swivel in the upper half of the ring.
    const swivelH = size * 0.022;
    const swivelR = size * 0.018;
    const swivelY = goldY - goldH * 0.5 - swivelH * 0.42;
    const swivel = new three.Mesh(
      new three.CylinderGeometry(swivelR, swivelR * 1.05, swivelH, 14),
      gunmetal
    );
    swivel.userData.craftPart = true;
    swivel.position.y = swivelY;
    swivel.scale.x = 0.86;

    const slot = new three.Mesh(
      new three.BoxGeometry(size * 0.007, swivelH * 0.7, swivelR * 2.2),
      gunmetalDark
    );
    slot.userData.craftPart = true;
    slot.position.set(0, swivelY, 0);

    // 4) Thick chrome split-ring — the silver eyelet on the gun.
    const split = buildCharmSplitRingGeometry(three, ringR, ringTube, 1.34);
    const ring = new three.Mesh(split.geometry, chrome);
    ring.userData.craftPart = true;
    ring.position.y = ringCenterY;
    ring.rotation.y = 0.28;

    const capR = ringTube * 0.98;
    const startCap = new three.Mesh(new three.SphereGeometry(capR, 10, 8), chrome);
    startCap.userData.craftPart = true;
    startCap.position.copy(split.start);
    const endCap = new three.Mesh(new three.SphereGeometry(capR, 10, 8), chrome);
    endCap.userData.craftPart = true;
    endCap.position.copy(split.end);
    ring.add(startCap, endCap);

    // 5) Silver screw-eye on the lower inner arc (into the charm crown).
    const eyeR = size * 0.014;
    const eyeTube = size * 0.0052;
    const eyeY = ringCenterY - ringR * 0.55;
    const screwEye = new three.Mesh(
      new three.TorusGeometry(eyeR, eyeTube, 8, 16),
      silver
    );
    screwEye.userData.craftPart = true;
    screwEye.position.y = eyeY;

    const screw = new three.Mesh(
      new three.CylinderGeometry(size * 0.0038, size * 0.0034, size * 0.006, 8),
      silver
    );
    screw.userData.craftPart = true;
    screw.position.y = eyeY - eyeR * 0.35;

    group.add(
      tip,
      topLoop,
      goldBand,
      goldLip,
      swivel,
      slot,
      ring,
      screwEye,
      screw
    );
    hardenCharmPinAgainstGunClip(group);

    return {
      group,
      tipY: 0,
      bottomY: ringBottomY,
      seatY: ringSeatY,
    };
  }

  /**
   * Build an elongated rectangular chain-link (two parallel bars + rounded ends).
   * Used for the CS2 character-charm gold connector.
   */
  function buildElongatedChainLinkMesh(three, halfW, halfH, tubeR, material) {
    const group = new three.Group();
    group.userData.craftPart = true;
    const radial = 10;
    const barLen = Math.max(halfH * 2 - tubeR * 0.2, tubeR * 2);

    const left = new three.Mesh(
      new three.CylinderGeometry(tubeR, tubeR, barLen, radial),
      material
    );
    left.userData.craftPart = true;
    left.position.set(-halfW, 0, 0);

    const right = new three.Mesh(
      new three.CylinderGeometry(tubeR, tubeR, barLen, radial),
      material
    );
    right.userData.craftPart = true;
    right.position.set(halfW, 0, 0);

    // Semi-torus caps (π) close the top and bottom of the rectangle.
    const topCap = new three.Mesh(
      new three.TorusGeometry(halfW, tubeR, radial, 20, Math.PI),
      material
    );
    topCap.userData.craftPart = true;
    topCap.position.set(0, halfH, 0);

    const botCap = new three.Mesh(
      new three.TorusGeometry(halfW, tubeR, radial, 20, Math.PI),
      material
    );
    botCap.userData.craftPart = true;
    botCap.position.set(0, -halfH, 0);
    botCap.rotation.z = Math.PI;

    group.add(left, right, topCap, botCap);
    return group;
  }

  /**
   * CS2 character-charm holding pin (Little Guerilla / figurine inspect):
   * dark base on the gun → thick silver/chrome cylindrical shaft that the
   * charm's head ring seats around (in-game connected look). Prior spindly
   * gold speck left a visible air gap above the crown.
   */
  function buildCs2CharacterMountPin(three, charmSize, isPreview = false) {
    const size = Math.max(Number(charmSize) || 0.08, 0.04);

    const baseMat = makeCharmPinMetalMaterial(three, 0x2a3038, isPreview, {
      metalness: 0.72,
      roughness: 0.48,
    });
    const silverMat = makeCharmPinMetalMaterial(three, 0xc8ced6, isPreview, {
      metalness: 0.92,
      roughness: 0.22,
    });
    const chromeMat = makeCharmPinMetalMaterial(three, 0xd4dae2, isPreview, {
      metalness: 0.95,
      roughness: 0.18,
    });
    const collarMat = makeCharmPinMetalMaterial(three, 0x9aa3ae, isPreview, {
      metalness: 0.85,
      roughness: 0.32,
    });

    const group = new three.Group();
    group.userData.craftPart = true;
    group.userData.standardCharmPin = true;
    group.userData.cs2GoldLinkPin = true;

    // Scale so the shaft reads like the in-game stud and reaches deep into the head.
    const baseR = size * 0.085;
    const baseH = size * 0.024;
    const shaftR = size * 0.058;
    const shaftLen = size * 0.34;

    // 1) Dark circular base mount flush on the weapon.
    const base = new three.Mesh(
      new three.CylinderGeometry(baseR, baseR * 1.06, baseH, 22),
      baseMat
    );
    base.userData.craftPart = true;
    base.position.y = -baseH * 0.35;

    const baseLip = new three.Mesh(
      new three.TorusGeometry(baseR * 0.7, size * 0.008, 8, 28),
      baseMat
    );
    baseLip.userData.craftPart = true;
    baseLip.rotation.x = Math.PI / 2;
    baseLip.position.y = -baseH * 0.85;

    // 2) Thick silver/chrome cylindrical shaft — charm head ring threads this.
    const shaftTopY = -baseH * 0.9;
    const shaft = new three.Mesh(
      new three.CylinderGeometry(shaftR, shaftR * 1.04, shaftLen, 18),
      silverMat
    );
    shaft.userData.craftPart = true;
    shaft.position.y = shaftTopY - shaftLen * 0.5;

    // Slight chrome collar under the base (rivet shoulder).
    const collar = new three.Mesh(
      new three.CylinderGeometry(shaftR * 1.22, shaftR * 1.08, size * 0.016, 16),
      collarMat
    );
    collar.userData.craftPart = true;
    collar.position.y = shaftTopY - size * 0.006;

    // Rounded end cap so the shaft reads as a solid stud through the ring.
    const capR = shaftR * 1.05;
    const capY = shaftTopY - shaftLen;
    const cap = new three.Mesh(
      new three.SphereGeometry(capR, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.7),
      chromeMat
    );
    cap.userData.craftPart = true;
    cap.position.y = capY;

    group.add(base, baseLip, collar, shaft, cap);
    hardenCharmPinAgainstGunClip(group);

    const bottomY = capY - capR * 0.45;
    // Free tip of the shaft — hang nest seats the crown here (pin end holds the head).
    const seatY = bottomY + shaftLen * 0.08;
    return {
      group,
      tipY: 0,
      bottomY,
      seatY,
      shaftTopY,
      shaftLen,
    };
  }

  /** CS2 grenade / keychain link: thick polished silver torus (distinct from character mount). */
  function buildGrenadeLinkRingPin(three, charmSize, isPreview = false) {
    const size = Math.max(Number(charmSize) || 0.08, 0.04);
    const silver = makeCharmPinMetalMaterial(three, 0xc5ccd6, isPreview, {
      metalness: 0.92,
      roughness: 0.2,
    });
    const tipMat = makeCharmPinMetalMaterial(three, 0xaeb6c0, isPreview, {
      metalness: 0.85,
      roughness: 0.32,
    });

    const group = new three.Group();
    group.userData.craftPart = true;
    group.userData.standardCharmPin = true;
    group.userData.grenadeLinkRing = true;

    const pegLen = size * 0.018;
    // Larger holding ring — seats through/against the charm crown (no thin floating circle).
    const ringR = size * 0.078;
    const ringTube = size * 0.028;
    const ringCenterY = -(pegLen + ringR - ringTube * 0.35);
    // Seat near the lower inner arc so the charm crown threads the ring.
    const ringSeatY = ringCenterY - ringR * 0.15;
    const ringBottomY = ringCenterY - ringR - ringTube * 0.1;

    const tip = new three.Mesh(new three.SphereGeometry(size * 0.016, 12, 10), tipMat);
    tip.userData.craftPart = true;
    tip.position.y = 0;

    const peg = new three.Mesh(
      new three.CylinderGeometry(size * 0.012, size * 0.013, pegLen, 10),
      tipMat
    );
    peg.userData.craftPart = true;
    peg.position.y = -pegLen * 0.5;

    const ring = new three.Mesh(
      new three.TorusGeometry(ringR, ringTube, 14, 36),
      silver
    );
    ring.userData.craftPart = true;
    ring.position.y = ringCenterY;

    group.add(tip, peg, ring);
    hardenCharmPinAgainstGunClip(group);

    return {
      group,
      tipY: 0,
      bottomY: ringBottomY,
      seatY: ringSeatY,
    };
  }

  function buildProceduralCharmPin(three, charmSize, isPreview = false, options = {}) {
    if (options.forCharacterCharm || options.forMissingLink || options.missingLinkLatch) {
      return buildCs2CharmHardwarePin(three, charmSize, isPreview);
    }
    return buildGrenadeLinkRingPin(three, charmSize, isPreview);
  }

  function buildEmbeddedPinRivet(three, size, embed, ringClear, isPreview) {
    const gunMetal = new three.MeshBasicMaterial({
      color: 0x6b7280,
      transparent: isPreview,
      opacity: isPreview ? 0.9 : 1,
      depthWrite: true,
    });
    const brass = new three.MeshBasicMaterial({
      color: 0x9ca3af,
      transparent: isPreview,
      opacity: isPreview ? 0.9 : 1,
      depthWrite: true,
    });
    const pegLen = embed + ringClear + size * 0.016;
    const peg = new three.Mesh(
      new three.CylinderGeometry(size * 0.014, size * 0.012, pegLen, 10),
      gunMetal
    );
    peg.userData.craftPart = true;
    peg.userData.standardCharmPin = true;
    peg.position.y = embed - pegLen * 0.5;
    peg.frustumCulled = false;
    peg.renderOrder = 67;

    const tip = new three.Mesh(new three.SphereGeometry(size * 0.018, 10, 8), brass);
    tip.userData.craftPart = true;
    tip.userData.standardCharmPin = true;
    tip.position.y = 0;
    tip.frustumCulled = false;
    tip.renderOrder = 67;

    return [peg, tip];
  }

  function buildStandardCharmPin(three, charmSize, isPreview = false, options = {}) {
    const size = Math.max(Number(charmSize) || 0.08, 0.04);
    // Slabs: tip rivet only — no pin circles (card eyelet is in the Steam art).
    if (options.forSlab) {
      return buildSlabCharmPin(three, size, isPreview);
    }

    // Grenade / kc_db_* keychains: thick polished silver link ring.
    if (options.forGrenadeCharm) {
      return buildGrenadeLinkRingPin(three, size, isPreview);
    }

    // Character figurines / Missing Link / sausage: CS2 clasp assembly
    // (dark loop + gold band + slotted swivel + chrome split-ring).
    if (options.forCharacterCharm || options.forMissingLink || options.missingLinkLatch) {
      return buildCs2CharmHardwarePin(three, size, isPreview);
    }

    // Tournament dog-tags: textured CS2 pin when available; else grenade ring mount.
    const template = charmPinFittedTemplate;
    if (!template || !options.forDogTag) {
      return buildGrenadeLinkRingPin(three, size, isPreview);
    }

    const cloned = three.SkeletonUtils?.clone
      ? three.SkeletonUtils.clone(template)
      : template.clone(true);
    // Re-run sanitize on the clone so shared template mats aren't mutated for preview.
    sanitizeCharmGltfMaterials(cloned, three, isPreview);

    const group = new three.Group();
    group.userData.craftPart = true;
    group.userData.standardCharmPin = true;
    group.add(cloned);

    // Compact textured clasp (kc_pin / kc_wpn_chain maps).
    // Dog-tags: slightly larger ring so the clasp reads like CS2 inspect.
    const pinScale = size * 0.32;
    group.scale.setScalar(pinScale);
    seatCharmPinTipFlush(group, three);

    if (isPreview) applyCharmPreviewMaterials(group, true);
    hardenCharmPinAgainstGunClip(group);

    const fittedBox = new three.Box3().setFromObject(group);
    let tipY = 0;
    let bottomY = -size * 0.22;
    if (!fittedBox.isEmpty()) {
      if (Number.isFinite(fittedBox.max.y)) tipY = fittedBox.max.y;
      if (Number.isFinite(fittedBox.min.y)) bottomY = fittedBox.min.y;
    }
    // Seat near the visual ring bottom (not the absolute AABB min / dangling verts).
    const pinSpan = Math.max(Math.abs(tipY - bottomY), size * 0.12);
    // Seat near the ring underside — climb off dangling verts under the tube.
    const seatY = bottomY + Math.max(pinSpan * 0.14, size * 0.014);
    return { group, bottomY, seatY, tipY };
  }

  function hideCharmNativeHardware(object) {
    if (!object) return;
    const detach = [];
    object.traverse((node) => {
      if (!(node.isMesh || node.isSkinnedMesh) || !node.material) return;
      const meshName = String(node.name || "").toLowerCase();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const hardwareIdx = [];
      const bodyIdx = [];
      materials.forEach((material, index) => {
        const matName = String(material?.name || "").toLowerCase();
        if (CHARM_HARDWARE_MATERIAL_RE.test(matName)) hardwareIdx.push(index);
        else bodyIdx.push(index);
      });

      const meshLooksHardware = CHARM_HARDWARE_MESH_RE.test(meshName)
        || (hardwareIdx.length && !bodyIdx.length);

      if (meshLooksHardware) {
        node.visible = false;
        node.userData.charmForceHidden = true;
        detach.push(node);
        return;
      }

      // Multi-material mesh: hide only hardware slots so the figurine/slab body stays.
      if (hardwareIdx.length && bodyIdx.length) {
        materials.forEach((material, index) => {
          if (!hardwareIdx.includes(index) || !material) return;
          material.visible = false;
          material.transparent = true;
          material.opacity = 0;
          material.depthWrite = false;
          material.needsUpdate = true;
        });
      }
    });
    // Fully detach pure chain meshes so they can't inflate seating bounds.
    detach.forEach((node) => {
      node.parent?.remove(node);
    });
  }

  function measureVisibleCharmBodyBox(cloned, three, options = {}) {
    const box = new three.Box3();
    let found = false;
    if (!cloned || !three) return box;
    const preserveCrown = Boolean(options.preserveCrown);
    cloned.updateMatrixWorld(true);
    const scratch = new three.Box3();
    cloned.traverse((node) => {
      if ((!node.isMesh && !node.isSkinnedMesh) || node.visible === false) return;
      if (node.userData?.charmForceHidden || node.userData?.standardCharmPin) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const bodyIdx = [];
      const hardwareIdx = [];
      materials.forEach((material, index) => {
        const name = String(material?.name || "").toLowerCase();
        const hidden = !material
          || material.visible === false
          || (material.transparent && Number(material.opacity) <= 0.02);
        if (hidden || CHARM_HARDWARE_MATERIAL_RE.test(name)) hardwareIdx.push(index);
        else bodyIdx.push(index);
      });
      if (!bodyIdx.length) return;

      scratch.makeEmpty();
      const groups = Array.isArray(node.geometry?.groups) ? node.geometry.groups : [];
      const canFilterGroups = hardwareIdx.length > 0
        && groups.length > 0
        && node.geometry?.getAttribute?.("position")
        && !node.isSkinnedMesh;

      if (canFilterGroups) {
        const pos = node.geometry.getAttribute("position");
        const indexAttr = node.geometry.index;
        const local = new three.Vector3();
        const world = new three.Vector3();
        bodyIdx.forEach((materialIndex) => {
          groups.forEach((group) => {
            if (group.materialIndex !== materialIndex) return;
            const start = Number(group.start) || 0;
            const count = Number(group.count) || 0;
            for (let i = start; i < start + count; i += 1) {
              const vi = indexAttr ? indexAttr.getX(i) : i;
              local.fromBufferAttribute(pos, vi);
              world.copy(local).applyMatrix4(node.matrixWorld);
              scratch.expandByPoint(world);
            }
          });
        });
      } else {
        scratch.setFromObject(node);
        // Multi-material skins keep invisible clasp verts in the AABB — trim the crown.
        // Missing Link sausages / character figurines often keep clasp verts in the skin
        // buffer after hardware hide; trim so seating uses the visible head, not air above it.
        // Grenades: keep the true crown so the shared pin stays on the body centerline.
        if (!preserveCrown && !scratch.isEmpty()) {
          const h = scratch.max.y - scratch.min.y;
          if (h > 1e-6) {
            let trimFrac = 0;
            if (options.aggressiveCrownTrim) {
              trimFrac = hardwareIdx.length ? 0.38 : 0.14;
            } else if (hardwareIdx.length) {
              trimFrac = 0.22;
            }
            if (trimFrac > 0) scratch.max.y -= h * trimFrac;
          }
        }
      }

      if (!scratch.isEmpty()) {
        if (!found) {
          box.copy(scratch);
          found = true;
        } else {
          box.union(scratch);
        }
      }
    });
    if (!found) box.setFromObject(cloned);
    return box;
  }

  function measureCharmHardwareBox(root, three) {
    const box = new three.Box3();
    let found = false;
    if (!root || !three) return box;
    root.updateMatrixWorld(true);
    const scratch = new three.Box3();
    const local = new three.Vector3();
    const world = new three.Vector3();
    root.traverse((node) => {
      if ((!node.isMesh && !node.isSkinnedMesh) || node.visible === false) return;
      if (node.userData?.charmForceHidden || node.userData?.standardCharmPin) return;
      const { hardwareIdx } = classifyCharmMeshMaterials(node);
      if (!hardwareIdx.length) return;

      scratch.makeEmpty();
      const groups = Array.isArray(node.geometry?.groups) ? node.geometry.groups : [];
      const pos = node.geometry?.getAttribute?.("position");
      const canFilterGroups = groups.length > 0 && pos;

      if (canFilterGroups) {
        const indexAttr = node.geometry.index;
        hardwareIdx.forEach((materialIndex) => {
          groups.forEach((group) => {
            if (group.materialIndex !== materialIndex) return;
            const start = Number(group.start) || 0;
            const count = Number(group.count) || 0;
            for (let i = start; i < start + count; i += 1) {
              const vi = indexAttr ? indexAttr.getX(i) : i;
              local.fromBufferAttribute(pos, vi);
              world.copy(local).applyMatrix4(node.matrixWorld);
              scratch.expandByPoint(world);
            }
          });
        });
      } else if (node.userData?.charmNativePin || hardwareIdx.length === (Array.isArray(node.material) ? node.material.length : 1)) {
        scratch.setFromObject(node);
      }
      if (!scratch.isEmpty()) {
        if (!found) {
          box.copy(scratch);
          found = true;
        } else {
          box.union(scratch);
        }
      }
    });
    return box;
  }

  function findCharmTipBone(root) {
    if (!root) return null;
    let tip = null;
    root.traverse((node) => {
      if (tip) return;
      if (node.isBone && /^joint1$/i.test(String(node.name || ""))) tip = node;
    });
    if (tip) return tip;
    root.traverse((node) => {
      if (tip || !node.isSkinnedMesh || !node.skeleton?.bones) return;
      tip = node.skeleton.bones.find((bone) => /^joint1$/i.test(String(bone.name || ""))) || null;
    });
    return tip;
  }

  /**
   * Translate so a world-space point lands on the parent origin (pin axis).
   * Must use parent space — subtracting object-local coords from position is wrong
   * once the mesh has been rotated (character upright / dog-tag pitch).
   */
  function nudgeCharmSoWorldPointHitsParentOrigin(cloned, worldPoint, three, axes = {}) {
    if (!cloned || !worldPoint || !three) return;
    const point = worldPoint.clone();
    if (cloned.parent) {
      cloned.parent.updateMatrixWorld(true);
      cloned.parent.worldToLocal(point);
    }
    const useX = axes.x !== false;
    const useY = axes.y !== false;
    const useZ = axes.z !== false;
    if (useX && Number.isFinite(point.x)) cloned.position.x -= point.x;
    if (useY && Number.isFinite(point.y)) cloned.position.y -= point.y;
    if (useZ && Number.isFinite(point.z)) cloned.position.z -= point.z;
    cloned.updateMatrixWorld(true);
  }

  function snapCharmTipBoneToLocalOrigin(cloned, three) {
    if (!cloned || !three) return false;
    cloned.updateMatrixWorld(true);
    cloned.traverse((node) => {
      if (node.isSkinnedMesh && node.skeleton) node.skeleton.update();
    });
    const tipBone = findCharmTipBone(cloned);
    if (!tipBone) return false;
    tipBone.updateWorldMatrix(true, false);
    const tipWorld = new three.Vector3();
    tipBone.getWorldPosition(tipWorld);
    nudgeCharmSoWorldPointHitsParentOrigin(cloned, tipWorld, three);
    return true;
  }

  function snapCharmBodyTopToLocalOrigin(cloned, three, options = {}) {
    if (!cloned || !three) return;
    // Tournament highlight dog-tags: seat by joint1 (pin stud), not the skinned AABB.
    if (options.preferTipBone && snapCharmTipBoneToLocalOrigin(cloned, three)) return;
    cloned.updateMatrixWorld(true);
    // Missing Link keeps its native clasp — seat by the full tip (hardware included).
    // Grenades: preserve the true crown (no clasp trim) so the pin stays centered.
    const box = options.includeHardware
      ? new three.Box3().setFromObject(cloned)
      : measureVisibleCharmBodyBox(cloned, three, {
        preserveCrown: Boolean(options.forGrenadeCharm || options.preserveCrown),
        aggressiveCrownTrim: Boolean(options.aggressiveCrownTrim),
      });
    if (box.isEmpty()) return;
    const topWorld = new three.Vector3(
      (box.min.x + box.max.x) * 0.5,
      box.max.y,
      (box.min.z + box.max.z) * 0.5
    );
    nudgeCharmSoWorldPointHitsParentOrigin(cloned, topWorld, three);

    // Round grenade bodies: lock the geometric center under the pin (X/Z), keep crown on Y=0.
    if (options.forGrenadeCharm) {
      centerCharmBodyUnderPinAxis(cloned, three);
    }
  }

  /** Keep the body centered under the shared pin — crown on Y, mass center on X/Z. */
  function centerCharmBodyUnderPinAxis(cloned, three, options = {}) {
    if (!cloned || !three) return;
    cloned.updateMatrixWorld(true);
    const measureOpts = {
      preserveCrown: Boolean(options.preserveCrown ?? true),
      aggressiveCrownTrim: Boolean(options.aggressiveCrownTrim),
    };
    const box = measureVisibleCharmBodyBox(cloned, three, measureOpts);
    if (box.isEmpty()) return;
    const centerWorld = box.getCenter(new three.Vector3());
    // X/Z only — keep crown height; parent-space nudge so rotation does not skew the pin axis.
    nudgeCharmSoWorldPointHitsParentOrigin(cloned, centerWorld, three, { y: false });
    // Re-seat crown flush on Y=0 after the XZ recenter.
    const seated = measureVisibleCharmBodyBox(cloned, three, measureOpts);
    if (!seated.isEmpty() && Number.isFinite(seated.max.y)) {
      const topWorld = new three.Vector3(
        (seated.min.x + seated.max.x) * 0.5,
        seated.max.y,
        (seated.min.z + seated.max.z) * 0.5
      );
      nudgeCharmSoWorldPointHitsParentOrigin(cloned, topWorld, three, { x: false, z: false });
    }
  }

  /**
   * Character / sausage: force head-up hang on -Y. Tip-bone / clasp verts often leave
   * the mesh canted so the shaft spears the ear instead of the crown.
   */
  function alignCharacterCharmHangUpright(cloned, three, options = {}) {
    if (!cloned || !three) return;
    cloned.updateMatrixWorld(true);
    const measureOpts = {
      aggressiveCrownTrim: true,
      preserveCrown: false,
    };
    let box = measureVisibleCharmBodyBox(cloned, three, measureOpts);
    if (box.isEmpty()) return;
    const size = box.getSize(new three.Vector3());
    const tallest = Math.max(size.x, size.y, size.z);
    // Rotate so the long body axis hangs on Y (head up). Skip if already upright.
    if (size.y < tallest * 0.88) {
      if (size.x >= size.z && size.x >= size.y) {
        cloned.rotateZ(-Math.PI / 2);
      } else if (size.z >= size.x && size.z >= size.y) {
        cloned.rotateX(Math.PI / 2);
      }
      cloned.updateMatrixWorld(true);
      box = measureVisibleCharmBodyBox(cloned, three, measureOpts);
      if (!box.isEmpty()) {
        const center = box.getCenter(new three.Vector3());
        // Mass should hang below the crown (negative Y). Flip if inverted.
        if (center.y > 0.002) {
          cloned.rotateX(Math.PI);
          cloned.updateMatrixWorld(true);
        }
      }
    }
    // Crown center on the pin axis — never the native side clasp / joint1.
    // Parent-space nudge (not object-local) so upright rotation cannot leave the
    // head laterally off the grenade ring.
    snapCharmBodyTopToLocalOrigin(cloned, three, {
      aggressiveCrownTrim: true,
      preserveCrown: false,
    });
    // Lock crown X/Z on the pin axis (not mass center — asymmetric arms/bandana
    // would otherwise slide the head beside the ring).
    cloned.updateMatrixWorld(true);
    box = measureVisibleCharmBodyBox(cloned, three, measureOpts);
    if (!box.isEmpty()) {
      const topWorld = new three.Vector3(
        (box.min.x + box.max.x) * 0.5,
        box.max.y,
        (box.min.z + box.max.z) * 0.5
      );
      nudgeCharmSoWorldPointHitsParentOrigin(cloned, topWorld, three);
    }
  }

  function assembleCharmWithStandardPin(cloned, charmSize, three, isPreview, options = {}) {
    // Gun charms (Small Arms): keep native eyelet + ring (CSGOSkins / in-game look).
    // Tip rivet only on the paint — never replace the ring with a second clasp.
    if (options.forGunCharm) {
      const pin = buildSlabCharmPin(three, charmSize, isPreview);
      cloned.userData.charmHangBody = true;
      snapCharmBodyTopToLocalOrigin(cloned, three, {
        preferTipBone: true,
        includeHardware: true,
      });
      // Nest the native ring onto the rivet so the eyelet reads locked through the circle.
      cloned.position.y += Math.max(charmSize * 0.022, 0.0015);
      cloned.updateMatrixWorld(true);
      const rivetY = Number.isFinite(pin.bottomY)
        ? pin.bottomY
        : -Math.max(charmSize * 0.006, 0.0008);
      return {
        pinGroup: pin.group,
        body: cloned,
        hangY: rivetY + Math.max(charmSize * 0.012, 0.0008),
      };
    }

    // Tournament dog-tags: shared clasp ring on the paint + native ball-chain
    // hanging through the circle (CS2 inspect). Do not glue tags to the slide.
    if (options.forDogTag) {
      const pin = buildStandardCharmPin(three, charmSize, isPreview, { forDogTag: true });
      cloned.userData.charmHangBody = true;
      if (!snapCharmTipBoneToLocalOrigin(cloned, three)) {
        snapCharmBodyTopToLocalOrigin(cloned, three, {
          preferTipBone: true,
          includeHardware: true,
        });
      }
      // Light nest — keep a visible ball-chain between the clasp and the tags.
      cloned.position.y += Math.max(charmSize * 0.01, 0.0007);
      cloned.updateMatrixWorld(true);
      return {
        pinGroup: pin.group,
        body: cloned,
        hangY: charmHangSeatY(pin, charmSize, { deepLatch: false }),
      };
    }

    // Native-hold-pin workshop charms: keep the GLB clasp, but bake it onto a
    // rigid pin group. The skinned chain/clasp shares the figurine mesh — if it
    // stays on the hang body, shaking the gun slides the pin off the paint.
    // Grenade / Bombastic (kc_db_chain) clasps stay on the hang mesh: baking
    // those triangles hid or misplaced the pin.
    if (options.keepNativeHoldPin) {
      cloned.userData.charmHangBody = true;
      alignCharacterCharmHangUpright(cloned, three);
      cloned.updateMatrixWorld(true);
      const size = Math.max(Number(charmSize) || 0.08, 0.04);
      const grenadeNativePin = Boolean(options.forGrenadeNativeHoldPin)
        || charmUsesGrenadeHoldChain(cloned);
      if (grenadeNativePin) {
        snapCharmBodyTopToLocalOrigin(cloned, three, { includeHardware: true });
        cloned.updateMatrixWorld(true);
        const pinGroup = new three.Group();
        pinGroup.userData.craftPart = true;
        pinGroup.userData.nativeHoldPin = true;
        pinGroup.userData.grenadeNativePinOnHangBody = true;
        return {
          pinGroup,
          body: cloned,
          hangY: 0,
        };
      }
      const pin = extractNativeHoldPinGroup(cloned, three, size);
      if (isPreview) applyCharmPreviewMaterials(pin.group, true);
      return {
        pinGroup: pin.group,
        body: cloned,
        hangY: charmHangSeatY(pin, size, { hangFromPin: true, missingLinkLatch: true }),
      };
    }

    const pin = buildStandardCharmPin(three, charmSize, isPreview, options);
    cloned.userData.charmHangBody = true;

    cloned.updateMatrixWorld(true);
    const isCharacterHang = Boolean(
      options.forCharacterCharm || options.forMissingLink || options.missingLinkLatch
    );
    // Character / sausage: NEVER seat on joint1 / native clasp — that bone sits on the
    // side of the head. Crown upright on -Y, hanging under the pin (not speared by it).
    if (isCharacterHang) {
      alignCharacterCharmHangUpright(cloned, three);
    } else {
      // Prefer joint1 for dog-tag-style tip latch only (not character hang).
      const seatByTip = Boolean(options.preferTipBone)
        && snapCharmTipBoneToLocalOrigin(cloned, three);
      if (seatByTip) {
        cloned.position.y += Math.max(charmSize * 0.1, 0.006);
        cloned.updateMatrixWorld(true);
      } else {
        const forGrenade = Boolean(options.forGrenadeCharm);
        const box = measureVisibleCharmBodyBox(cloned, three, {
          preserveCrown: forGrenade,
          aggressiveCrownTrim: false,
        });
        if (!box.isEmpty()) {
          const topWorld = new three.Vector3(
            (box.min.x + box.max.x) * 0.5,
            box.max.y,
            (box.min.z + box.max.z) * 0.5
          );
          nudgeCharmSoWorldPointHitsParentOrigin(cloned, topWorld, three);
          if (forGrenade) {
            centerCharmBodyUnderPinAxis(cloned, three, { preserveCrown: true });
          }
          if (options.liftIntoRing) {
            const lift = options.forGrenadeCharm
              ? Math.max(charmSize * 0.085, 0.005)
              : Math.max(charmSize * 0.045, 0.0028);
            cloned.position.y += lift;
          }
          cloned.updateMatrixWorld(true);
        }
      }
    }

    return {
      pinGroup: pin.group,
      body: cloned,
      hangY: charmHangSeatY(pin, charmSize, {
        deepLatch: Boolean(!isCharacterHang && (options.preferTipBone || options.deepLatch || options.liftIntoRing)),
        hangFromPin: isCharacterHang && !options.sausageLatch,
        missingLinkLatch: Boolean(options.missingLinkLatch) && !options.sausageLatch,
        sausageLatch: Boolean(options.sausageLatch),
        forSlab: Boolean(options.forSlab),
      }),
    };
  }

  function looksLikeCharmInspectModel(url, title) {
    const hint = `${url || ""} ${title || ""}`.toLowerCase();
    return /keychains\/|\/kc_|charm\.gltf|\bcharm\s*\|/.test(hint);
  }

  function isSausageCharmHint(url, title) {
    const hint = `${url || ""} ${title || ""}`.toLowerCase();
    return /wurst|catchup|hot\s*sauce|diner\s*dog|sam_shape/.test(hint);
  }

  // Workshop-blank Missing Link community charms (Azter + zip siblings),
  // replaced sausage charms (Hot Wurst / Hot Sauce / Diner Dog), and
  // Bombastic / Dr. Boom grenade keychains: keep the GLB's native clasp /
  // holding pin. Do not swap in kc_pin and do not hide chain/clip/clasp
  // materials. nativeHoldPin wins over sausageLatch (old eyelet + chrome ring).
  // Lil' SAS and other official figurines still use the shared pin.
  const NATIVE_HOLD_PIN_SLUGS = [
    "azter", "bag", "bascet", "burger", "cactus", "charm_cord", "cigar", "dog",
    "dragon", "elefant", "eye", "foto", "ghoust", "happy", "ice", "lava",
    "pencil", "pinata", "sam_catchup", "sam_shape", "slime", "super", "tama",
    "untitled", "wurst",
  ];
  const NATIVE_HOLD_PIN_GRENADE_SLUGS = [
    "200iq", "8ball", "aztec", "biomech", "bombacat", "clown", "dimsum", "drbrian",
    "dripfade", "eco", "eviscerate", "eyecritter", "flash", "hellcat", "incendiary",
    "lighter", "occult", "terror", "ugly", "wood", "yeti", "yinyang",
  ];
  const NATIVE_HOLD_PIN_TOKEN_RE = new RegExp(
    `kc_missinglink_(?:${NATIVE_HOLD_PIN_SLUGS.join("|")})\\b`
  );
  const NATIVE_HOLD_PIN_GRENADE_RE = new RegExp(
    `kc_db_(?:${NATIVE_HOLD_PIN_GRENADE_SLUGS.join("|")})\\b`
  );
  const NATIVE_HOLD_PIN_TITLE_RE = /\bcharm\s*\|\s*(?:azter|dead\s*weight|diner\s*dog|hang\s*loose|hot\s*(?:wurst|sauce)|lil['’]?\s*(?:baller|boo|buns|cackle|eldritch|goop|happy|hero|chirp|moments|no\.?\s*2|prick|serpent|smokey|tusk|vino)|magmatude|pi[nñ]atita|pocket\s*pop)\b/;
  const NATIVE_HOLD_PIN_GRENADE_TITLE_RE = /\bcharm\s*\|\s*(?:8\s*ball\s*igl|big\s*brain|biomech|bomb\s*tag|butane\s*buddy|dr\.?\s*brian|eye\s*of\s*ball|flash\s*bomb|fluffy|glitter\s*bomb|gritty|hungry\s*eyes|lil['’]?\s*(?:bloody|dumplin['’]?|eco|facelift|ferno|chomper|yeti|zen)|splatter\s*cat|whittle\s*guy)\b/;

  function isNativeHoldPinGrenadeHint(url, title, entry) {
    const hint = `${url || ""} ${title || ""} ${entry?.model_token || entry?.token || ""}`.toLowerCase();
    return NATIVE_HOLD_PIN_GRENADE_RE.test(hint) || NATIVE_HOLD_PIN_GRENADE_TITLE_RE.test(hint);
  }

  function isNativeHoldPinCharmHint(url, title, entry) {
    const hint = `${url || ""} ${title || ""} ${entry?.model_token || entry?.token || ""}`.toLowerCase();
    if (entry && (entry.nativeHoldPin === true || entry.native_hold_pin === true)) return true;
    if (isNativeHoldPinGrenadeHint(url, title, entry)) return true;
    return NATIVE_HOLD_PIN_TOKEN_RE.test(hint) || NATIVE_HOLD_PIN_TITLE_RE.test(hint);
  }

  function charmUsesGrenadeHoldChain(root) {
    let found = false;
    root?.traverse?.((node) => {
      if (found || (!node.isMesh && !node.isSkinnedMesh)) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      if (mats.some((mat) => /kc_db_chain/.test(String(mat?.name || "").toLowerCase()))) {
        found = true;
      }
    });
    return found;
  }

  function classifyCharmInspectKind(url, title) {
    const hint = `${url || ""} ${title || ""}`.toLowerCase();
    const isMissingLink = /missinglink|wurst|hot\s*wurst|missing\s*link/.test(hint);
    const isSausageCharm = isSausageCharmHint(hint);
    const isHighlightCharm = isHighlightDogTagHint(hint);
    const isGunCharm = /kc_wpn_|weapon_1|small\s*arms/.test(hint);
    const isGrenadeCharm = !isGunCharm && !isMissingLink && (
      /kc_db_|drboom|incendiary|flash|hellcat|bombacat|biomech|hot\s*hands|magma|tec9_magma/.test(hint)
    );
    const isSlab = /sticker\s*slab|sticker_display_case/.test(hint);
    return { isMissingLink, isSausageCharm, isHighlightCharm, isGunCharm, isGrenadeCharm, isSlab };
  }

  function classifyCharmMeshMaterials(node) {
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const meshName = String(node.name || "").toLowerCase();
    const hardwareIdx = [];
    const bodyIdx = [];
    materials.forEach((material, index) => {
      const matName = String(material?.name || "").toLowerCase();
      const isHardware = CHARM_HARDWARE_MATERIAL_RE.test(matName)
        || CHARM_HARDWARE_MESH_RE.test(meshName);
      if (isHardware) hardwareIdx.push(index);
      else bodyIdx.push(index);
    });
    return { materials, hardwareIdx, bodyIdx };
  }

  function hideCharmMaterialSlots(node, indexes) {
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    (indexes || []).forEach((index) => {
      const mat = mats[index];
      if (!mat) return;
      mat.visible = false;
      mat.transparent = true;
      mat.opacity = 0;
      mat.depthWrite = false;
      mat.needsUpdate = true;
    });
  }

  function extractGeometryByMaterial(src, three, materialIndexes) {
    const groups = Array.isArray(src?.groups) ? src.groups : [];
    const wanted = groups.filter((group) => materialIndexes.includes(group.materialIndex));
    const pos = src?.getAttribute?.("position");
    if (!wanted.length || !pos) return src.clone();

    const indexAttr = src.index;
    const oldIndex = [];
    wanted.forEach((group) => {
      const start = Number(group.start) || 0;
      const count = Number(group.count) || 0;
      for (let i = start; i < start + count; i += 1) {
        oldIndex.push(indexAttr ? indexAttr.getX(i) : i);
      }
    });
    const unique = [];
    const remap = new Map();
    oldIndex.forEach((old) => {
      if (!remap.has(old)) {
        remap.set(old, unique.length);
        unique.push(old);
      }
    });
    if (!unique.length) return src.clone();

    const copyAttr = (attr, itemSize) => {
      if (!attr) return null;
      const out = new Float32Array(unique.length * itemSize);
      unique.forEach((old, i) => {
        for (let k = 0; k < itemSize; k += 1) {
          out[i * itemSize + k] = typeof attr.getComponent === "function"
            ? attr.getComponent(old, k)
            : (k === 0 ? attr.getX(old) : (k === 1 ? attr.getY(old) : attr.getZ(old)));
        }
      });
      return new three.BufferAttribute(out, itemSize);
    };

    const geom = new three.BufferGeometry();
    geom.setAttribute("position", copyAttr(pos, 3));
    const norm = src.getAttribute("normal");
    const uv = src.getAttribute("uv");
    if (norm) geom.setAttribute("normal", copyAttr(norm, 3));
    if (uv) geom.setAttribute("uv", copyAttr(uv, 2));
    geom.setIndex(oldIndex.map((old) => remap.get(old)));
    return geom;
  }

  // Bake a skinned clasp into a static mesh so sway on the body cannot drag it.
  function bakeCharmMeshToStatic(node, three, keepMaterialIndexes) {
    if (!node?.geometry || !three) return null;
    node.updateMatrixWorld(true);
    if (node.isSkinnedMesh && node.skeleton) node.skeleton.update();

    let geom = node.geometry.clone();
    if (node.isSkinnedMesh && typeof node.boneTransform === "function") {
      const pos = geom.attributes.position;
      const target = new three.Vector3();
      for (let i = 0; i < pos.count; i += 1) {
        node.boneTransform(i, target);
        pos.setXYZ(i, target.x, target.y, target.z);
      }
      pos.needsUpdate = true;
      if (geom.attributes.skinIndex) geom.deleteAttribute("skinIndex");
      if (geom.attributes.skinWeight) geom.deleteAttribute("skinWeight");
    }

    const srcMats = Array.isArray(node.material) ? node.material : [node.material];
    let material;
    if (keepMaterialIndexes?.length && Array.isArray(node.material) && node.geometry.groups?.length) {
      geom = extractGeometryByMaterial(geom, three, keepMaterialIndexes);
      const hwMats = keepMaterialIndexes.map((index) => srcMats[index]).filter(Boolean);
      material = hwMats.length <= 1
        ? (hwMats[0]?.clone?.() || hwMats[0] || srcMats[0])
        : hwMats.map((mat) => mat.clone());
    } else if (Array.isArray(node.material)) {
      material = srcMats.map((mat) => (mat ? mat.clone() : mat));
    } else {
      material = node.material?.clone?.() || node.material;
    }
    if (geom.attributes.normal) geom.computeVertexNormals();

    const mesh = new three.Mesh(geom, material);
    mesh.applyMatrix4(node.matrixWorld);
    mesh.userData.craftPart = true;
    mesh.userData.standardCharmPin = true;
    mesh.userData.charmNativePin = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 68;
    return mesh;
  }

  function extractNativeHoldPinGroup(cloned, three, charmSize) {
    const size = Math.max(Number(charmSize) || 0.08, 0.04);
    const pinGroup = new three.Group();
    pinGroup.userData.craftPart = true;
    pinGroup.userData.nativeHoldPin = true;
    pinGroup.userData.standardCharmPin = true;
    pinGroup.userData.charmRigidPin = true;
    const fallback = {
      group: pinGroup,
      tipY: 0,
      bottomY: -size * 0.08,
      seatY: -size * 0.04,
    };
    if (!cloned || !three) return fallback;
    // Bombastic grenade clasps stay on the skinned hang mesh (pre-bake path).
    if (charmUsesGrenadeHoldChain(cloned)) return fallback;

    cloned.updateMatrixWorld(true);
    cloned.traverse((node) => {
      if (node.isSkinnedMesh && node.skeleton) node.skeleton.update();
    });

    const jobs = [];
    cloned.traverse((node) => {
      if ((!node.isMesh && !node.isSkinnedMesh) || node.visible === false) return;
      if (node.userData?.charmForceHidden || node.userData?.standardCharmPin) return;
      const { hardwareIdx, bodyIdx } = classifyCharmMeshMaterials(node);
      if (!hardwareIdx.length) return;
      jobs.push({ node, hardwareIdx, bodyIdx });
    });

    jobs.forEach(({ node, hardwareIdx, bodyIdx }) => {
      const baked = bakeCharmMeshToStatic(node, three, hardwareIdx);
      if (baked) pinGroup.add(baked);
      if (!bodyIdx.length) {
        node.visible = false;
        node.userData.charmForceHidden = true;
      } else {
        hideCharmMaterialSlots(node, hardwareIdx);
      }
    });

    if (!pinGroup.children.length) return fallback;

    hardenCharmPinAgainstGunClip(pinGroup);
    seatCharmPinTipFlush(pinGroup, three);
    const box = new three.Box3().setFromObject(pinGroup);
    let tipY = 0;
    let bottomY = -size * 0.08;
    if (!box.isEmpty()) {
      if (Number.isFinite(box.max.y)) tipY = box.max.y;
      if (Number.isFinite(box.min.y)) bottomY = box.min.y;
    }
    const pinSpan = Math.max(Math.abs(tipY - bottomY), size * 0.12);
    const seatY = bottomY + Math.max(pinSpan * 0.14, size * 0.014);
    return { group: pinGroup, tipY, bottomY, seatY };
  }

  /**
   * CS2 keychain GLTFs ship in bind pose: the U-clasp / chain is modeled through
   * the crown. Split hardware off the body and lift it so the pin hangs above.
   */
  function liftCharmNativePinAboveBody(root, three) {
    if (!root || !three) return 0;
    const hardwareNodes = [];
    const mixed = [];
    root.updateMatrixWorld(true);
    root.traverse((node) => {
      if ((!node.isMesh && !node.isSkinnedMesh) || node.visible === false) return;
      if (node.userData?.standardCharmPin || node.userData?.charmForceHidden) return;
      const { hardwareIdx, bodyIdx } = classifyCharmMeshMaterials(node);
      if (hardwareIdx.length && !bodyIdx.length) hardwareNodes.push(node);
      else if (hardwareIdx.length && bodyIdx.length) mixed.push(node);
    });

    mixed.forEach((node) => {
      const { hardwareIdx, bodyIdx } = classifyCharmMeshMaterials(node);
      const pin = node.clone();
      pin.userData = { ...(pin.userData || {}), charmNativePin: true };
      if (Array.isArray(pin.material)) {
        pin.material = pin.material.map((mat, index) => {
          if (!bodyIdx.includes(index) || !mat) return mat;
          const hidden = mat.clone();
          hidden.visible = false;
          hidden.transparent = true;
          hidden.opacity = 0;
          hidden.depthWrite = false;
          return hidden;
        });
      }
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      hardwareIdx.forEach((index) => {
        const mat = mats[index];
        if (!mat) return;
        mat.visible = false;
        mat.transparent = true;
        mat.opacity = 0;
        mat.depthWrite = false;
        mat.needsUpdate = true;
      });
      node.parent?.add(pin);
      hardwareNodes.push(pin);
    });

    if (!hardwareNodes.length) return 0;

    root.updateMatrixWorld(true);
    const bodyBox = measureVisibleCharmBodyBox(root, three, {
      preserveCrown: true,
      aggressiveCrownTrim: false,
    });
    const hwBox = measureCharmHardwareBox(root, three);
    if (bodyBox.isEmpty() || hwBox.isEmpty()) return 0;

    const bodyHeight = Math.max(bodyBox.max.y - bodyBox.min.y, 1e-6);
    const overlap = bodyBox.max.y - hwBox.min.y;
    if (overlap <= bodyHeight * 0.008) return 0;

    const gap = Math.max(bodyHeight * 0.05, 0.0009);
    const lift = Math.min(overlap + gap, bodyHeight * 0.45);
    hardwareNodes.forEach((node) => {
      node.position.y += lift;
      node.updateMatrixWorld(true);
    });
    return lift;
  }

  function applyCharmInspectPresentation(modelRoot, three, options = {}) {
    if (!modelRoot || !three) return { kind: "none", lift: 0 };
    const kindInfo = classifyCharmInspectKind(options.modelUrl, options.title);
    modelRoot.rotation.set(0, 0, 0);
    modelRoot.updateMatrixWorld(true);

    if (kindInfo.isHighlightCharm) {
      alignDogTagHangDown(modelRoot, three);
      return { kind: "dogtag", lift: 0 };
    }
    if (kindInfo.isGunCharm || kindInfo.isSlab) {
      return { kind: kindInfo.isSlab ? "slab" : "gun", lift: 0 };
    }

    if (kindInfo.isMissingLink || !kindInfo.isGrenadeCharm) {
      alignCharacterCharmHangUpright(modelRoot, three);
    }
    // Eyes / face toward +Z (item-page camera looks down +Z).
    modelRoot.rotateY(Math.PI / 2);
    modelRoot.updateMatrixWorld(true);
    const lift = liftCharmNativePinAboveBody(modelRoot, three);
    return {
      kind: kindInfo.isGrenadeCharm ? "grenade" : "figurine",
      lift,
    };
  }

  function resolveCharmInspectCameraPlacement(framedCenter, framedSize, three, options = {}) {
    const viewerAspect = Math.max(options.viewerAspect || 1, 1);
    const verticalFov = three.MathUtils.degToRad(options.cameraFov || VIEWER_CAMERA_FOV);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * viewerAspect);
    const heightSize = Math.max(framedSize.y, 0.001);
    const widthSize = Math.max(framedSize.x, framedSize.z * 0.55, 0.001);
    const depthSize = Math.max(framedSize.z, 0.001);
    const fitHeightDistance = (heightSize * 0.5 * 1.32) / Math.tan(verticalFov / 2);
    const fitWidthDistance = (widthSize * 0.5 * 1.2) / Math.tan(horizontalFov / 2);
    const cameraDistance = Math.max(fitHeightDistance, fitWidthDistance) * 1.08 + depthSize * 0.2;
    const focus = framedCenter.clone();
    focus.y += heightSize * 0.08;
    const position = focus.clone();
    position.z += cameraDistance;
    return {
      position,
      focus,
      cameraDistance,
      maxDimension: Math.max(heightSize, widthSize, depthSize),
    };
  }

  /** Pull flat-backed charms so their back sits on the pin plane (local z ≈ 0). */
  function seatCharmBackOnPinPlane(cloned, three, options = {}) {
    // Missing Link / character / grenades hang free — Z-shift throws the pin off the body center.
    if (
      !cloned
      || !three
      || options.isMissingLink
      || options.forGrenadeCharm
      || options.forCharacterCharm
    ) return;
    cloned.updateMatrixWorld(true);
    const box = measureVisibleCharmBodyBox(cloned, three);
    if (box.isEmpty()) return;
    const corners = [
      new three.Vector3(box.min.x, box.min.y, box.min.z),
      new three.Vector3(box.min.x, box.min.y, box.max.z),
      new three.Vector3(box.min.x, box.max.y, box.min.z),
      new three.Vector3(box.min.x, box.max.y, box.max.z),
      new three.Vector3(box.max.x, box.min.y, box.min.z),
      new three.Vector3(box.max.x, box.min.y, box.max.z),
      new three.Vector3(box.max.x, box.max.y, box.min.z),
      new three.Vector3(box.max.x, box.max.y, box.max.z),
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    corners.forEach((corner) => {
      cloned.worldToLocal(corner);
      if (corner.x < minX) minX = corner.x;
      if (corner.x > maxX) maxX = corner.x;
      if (corner.y < minY) minY = corner.y;
      if (corner.y > maxY) maxY = corner.y;
      if (corner.z < minZ) minZ = corner.z;
      if (corner.z > maxZ) maxZ = corner.z;
    });
    if (!Number.isFinite(minZ) || !Number.isFinite(maxZ)) return;
    const sizeX = Math.max(maxX - minX, 1e-6);
    const sizeY = Math.max(maxY - minY, 1e-6);
    const sizeZ = Math.max(maxZ - minZ, 1e-6);
    // Only for flat/card-like charms where Z is the thin axis (gun charms, slabs, dog-tags).
    if (!options.isSlab && !options.forDogTag && sizeZ > Math.min(sizeX, sizeY) * 0.42) return;
    // Slabs / dog-tags: seat the back just outside the pin plane so the body clears the paint.
    const backClear = options.isSlab
      ? 0.0028
      : options.forDogTag
        ? 0.0012
        : 0.0008;
    cloned.position.z += backClear - minZ;
    cloned.updateMatrixWorld(true);
  }

  function attachStickerFaceToSlabModel(cloned, texture, three, isPreview, options = {}) {
    if (!cloned || !texture || !three) return;
    // Sticker window only — header lives on the graded-case header plate geometry.
    const map = bakeCraftTextureForMesh(texture, three)
      || prepareCharmFigurineTexture(texture, three)
      || texture;
    const mat = new three.MeshBasicMaterial({
      map,
      color: 0xffffff,
      transparent: true,
      opacity: isPreview ? 0.96 : 1,
      alphaTest: 0.02,
      depthWrite: false,
      side: three.DoubleSide,
    });
    const [sx, sy] = SLAB_FACE_LOCAL.size;
    const [cx, cy, cz] = SLAB_FACE_LOCAL.center;
    const face = new three.Mesh(new three.PlaneGeometry(sx, sy), mat);
    // Model face normal is +Y; PlaneGeometry defaults to +Z.
    face.rotation.x = -Math.PI / 2;
    face.position.set(cx, cy + 0.012, cz);
    face.renderOrder = 65;
    face.frustumCulled = false;
    face.userData.craftPart = true;
    face.userData.hangArt = true;
    face.userData.slabStickerFace = true;

    // Parent under the Source node that carries the CS2 axis/scale matrix so
    // the sticker sits in the display window in the same space as the mesh.
    let host = null;
    cloned.traverse((node) => {
      if (host) return;
      if ((node.isMesh || node.isSkinnedMesh) && node.geometry) host = node;
    });
    if (host?.parent) {
      host.parent.add(face);
    } else {
      cloned.add(face);
    }
  }

  function sanitizeCharmGltfMaterials(object, three, isPreview = false) {
    if (!object || !three) return;
    object.traverse((node) => {
      if ((!node.isMesh && !node.isSkinnedMesh) || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const nextMaterials = materials.map((material) => {
        if (!material) return material;
        if (material.userData?.charmSanitized) return material;
        const name = String(material.name || "").toLowerCase();
        const isHardware = CHARM_HARDWARE_MATERIAL_RE.test(name);
        const isGunBody = /kc_wpn_/.test(name) && !isHardware;
        const map = material.map || null;
        const normalMap = material.normalMap || null;

        const prepareMap = (tex, srgb) => {
          if (!tex) return;
          if (srgb) {
            tex.encoding = three.sRGBEncoding ?? tex.encoding;
            if ("colorSpace" in tex && three.SRGBColorSpace) tex.colorSpace = three.SRGBColorSpace;
          }
          tex.flipY = false;
          tex.needsUpdate = true;
        };

        if (isHardware) {
          const cloned = material.clone();
          // Without an env map, full metalness reads as a black void.
          if ("metalness" in cloned) cloned.metalness = Math.min(Number(cloned.metalness) || 0.45, 0.55);
          if ("roughness" in cloned) cloned.roughness = Math.max(Number(cloned.roughness) || 0.4, 0.38);
          prepareMap(cloned.map, true);
          prepareMap(cloned.normalMap, false);
          prepareMap(cloned.metalnessMap, false);
          prepareMap(cloned.roughnessMap, false);
          prepareMap(cloned.aoMap, false);
          if (cloned.normalMap) cloned.normalMap.premultiplyAlpha = false;
          if (isPreview) {
            cloned.transparent = true;
            cloned.opacity = Math.min(Number(cloned.opacity) || 1, 0.92);
          }
          cloned.userData = { ...(cloned.userData || {}), charmSanitized: true };
          cloned.needsUpdate = true;
          return cloned;
        }

        // Gun charms (Baby's AK, Die-cast AK, Lil' Squirt, etc.).
        // Prefer color + normal so flat tint maps (Die-cast) still read gun shape.
        // Keep metalness low so viewer lights do not neon-wash toy paint.
        if (isGunBody && map) {
          prepareMap(map, true);
          prepareMap(normalMap, false);
          prepareMap(material.aoMap, false);
          if (normalMap && three.MeshStandardMaterial) {
            const std = new three.MeshStandardMaterial({
              name: material.name,
              map,
              normalMap: normalMap || undefined,
              aoMap: material.aoMap || undefined,
              color: 0xffffff,
              metalness: /jelly|jewel|gold|crystal|spoon|magma|glitter/i.test(name) ? 0.42 : 0.12,
              roughness: /jelly|jewel|gold|crystal|spoon|magma|glitter/i.test(name) ? 0.28 : 0.62,
              transparent: Boolean(isPreview || material.transparent),
              opacity: isPreview ? 0.92 : (Number(material.opacity) || 1),
              side: material.side != null ? material.side : three.FrontSide,
              depthWrite: material.depthWrite !== false,
              alphaTest: Number(material.alphaTest) || 0,
            });
            if (normalMap && "normalScale" in std && material.normalScale) {
              std.normalScale.copy(material.normalScale);
            }
            std.userData = { charmSanitized: true };
            std.needsUpdate = true;
            return std;
          }
          const basic = new three.MeshBasicMaterial({
            name: material.name,
            map,
            color: 0xffffff,
            transparent: Boolean(isPreview || material.transparent),
            opacity: isPreview ? 0.92 : (Number(material.opacity) || 1),
            side: material.side != null ? material.side : three.FrontSide,
            depthWrite: material.depthWrite !== false,
            alphaTest: Number(material.alphaTest) || 0,
          });
          basic.userData = { charmSanitized: true };
          basic.needsUpdate = true;
          return basic;
        }

        // Other PBR figurines: keep one-to-one shading (color + normal + ORM).
        if (map && normalMap && three.MeshStandardMaterial) {
          prepareMap(map, true);
          prepareMap(normalMap, false);
          prepareMap(material.metalnessMap, false);
          prepareMap(material.roughnessMap, false);
          prepareMap(material.aoMap, false);
          const std = new three.MeshStandardMaterial({
            name: material.name,
            map: map || undefined,
            normalMap: normalMap || undefined,
            metalnessMap: material.metalnessMap || undefined,
            roughnessMap: material.roughnessMap || undefined,
            aoMap: material.aoMap || undefined,
            color: 0xffffff,
            metalness: Math.min(Number(material.metalness) || 0.2, 0.45),
            roughness: Math.max(Number(material.roughness) || 0.55, 0.42),
            transparent: Boolean(isPreview || material.transparent),
            opacity: isPreview ? 0.92 : (Number(material.opacity) || 1),
            side: material.side != null ? material.side : three.FrontSide,
            depthWrite: material.depthWrite !== false,
          });
          if (normalMap && "normalScale" in std && material.normalScale) {
            std.normalScale.copy(material.normalScale);
          }
          std.userData = { charmSanitized: true };
          std.needsUpdate = true;
          return std;
        }

        // Other bodies: MeshBasic + color map (no env-dependent black metals).
        if (map) prepareMap(map, true);
        const basic = new three.MeshBasicMaterial({
          name: material.name,
          map: map || undefined,
          color: map ? 0xffffff : (material.color?.isColor ? material.color.clone() : 0xc0c6d0),
          transparent: Boolean(isPreview || material.transparent),
          opacity: isPreview ? 0.92 : (Number(material.opacity) || 1),
          side: material.side != null ? material.side : three.FrontSide,
          alphaTest: Number(material.alphaTest) || 0,
          depthWrite: material.depthWrite !== false,
        });
        basic.userData = { charmSanitized: true };
        basic.needsUpdate = true;
        return basic;
      });
      node.material = Array.isArray(node.material) ? nextMaterials : nextMaterials[0];
      node.frustumCulled = false;
      if (node.userData?.charmForceHidden) node.visible = false;
      else node.visible = true;
      node.renderOrder = Math.max(Number(node.renderOrder) || 0, 50);
    });
  }

  function applyCharmIconToGltfModel(object, texture, three, isPreview, options = {}) {
    if (!object) return;
    const hideBody = Boolean(options.hideBody);
    object.traverse((node) => {
      if ((!node.isMesh && !node.isSkinnedMesh) || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      let hidesAllSlots = hideBody;
      const nextMaterials = materials.map((material) => {
        if (!material) return material;
        const name = String(material.name || "").toLowerCase();
        const isHardware = CHARM_HARDWARE_MATERIAL_RE.test(name);
        const isBody = CHARM_BODY_MATERIAL_RE.test(name);
        const cloned = material.clone();

        if (isHardware) {
          if (isPreview) {
            cloned.transparent = true;
            cloned.opacity = Math.min(Number(cloned.opacity) || 1, 0.92);
          }
          cloned.needsUpdate = true;
          hidesAllSlots = false;
          return cloned;
        }

        if (hideBody) {
          cloned.transparent = true;
          cloned.opacity = 0;
          cloned.depthWrite = false;
          cloned.visible = false;
          cloned.needsUpdate = true;
          return cloned;
        }

        // Always keep native CS2 body textures — never replace with the catalog icon
        // (that path left many charms as solid black cards).
        if (options.keepNativeBody || isBody || !texture) {
          hidesAllSlots = false;
          if (isPreview) {
            cloned.transparent = true;
            cloned.opacity = Math.min(Number(cloned.opacity) || 1, 0.92);
          }
          cloned.needsUpdate = true;
          return cloned;
        }

        if (texture) {
          cloned.map = texture;
          if (cloned.normalMap) cloned.normalMap = null;
          if (cloned.color?.isColor) cloned.color.setHex(0xffffff);
          if ("metalness" in cloned) cloned.metalness = 0;
          if ("roughness" in cloned) cloned.roughness = 1;
          cloned.transparent = true;
          cloned.opacity = isPreview ? 0.9 : 1;
          cloned.alphaTest = 0.04;
          cloned.needsUpdate = true;
          hidesAllSlots = false;
        } else if (isPreview) {
          cloned.transparent = true;
          cloned.opacity = Math.min(Number(cloned.opacity) || 1, 0.9);
          cloned.needsUpdate = true;
          hidesAllSlots = false;
        }
        return cloned;
      });
      node.material = Array.isArray(node.material) ? nextMaterials : nextMaterials[0];
      node.renderOrder = 50;
      node.frustumCulled = false;
      node.visible = !hidesAllSlots;
      if (node.isSkinnedMesh && node.skeleton) {
        node.skeleton.update();
      }
    });

    if (!hideBody) {
      sanitizeCharmGltfMaterials(object, three, isPreview);
    }
  }

  function isolateCharmPinMeshes(cloned, three) {
    if (!cloned || !three) return;
    const meshes = [];
    cloned.traverse((node) => {
      if (node.isMesh || node.isSkinnedMesh) meshes.push(node);
    });

    meshes.forEach((node) => {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (!materials.length) return;

      const hardwareIdx = [];
      const bodyIdx = [];
      materials.forEach((material, index) => {
        const name = String(material?.name || "").toLowerCase();
        if (CHARM_HARDWARE_MATERIAL_RE.test(name)) {
          hardwareIdx.push(index);
        } else if (CHARM_BODY_MATERIAL_RE.test(name) || material?.visible === false || material?.opacity === 0) {
          bodyIdx.push(index);
        } else {
          // Unknown slot on default keychain — treat as body when hardware already found.
          (hardwareIdx.length ? bodyIdx : hardwareIdx).push(index);
        }
      });

      // Multi-material mesh: keep only hardware groups so eco verts stop affecting bounds.
      if (materials.length > 1 && hardwareIdx.length && bodyIdx.length && node.geometry?.groups?.length) {
        const keepGroups = node.geometry.groups.filter((group) => hardwareIdx.includes(group.materialIndex));
        if (keepGroups.length) {
          node.geometry = node.geometry.clone();
          node.geometry.groups = keepGroups.map((group) => ({ ...group }));
          node.material = hardwareIdx.map((index) => materials[index]);
          // Remap materialIndex to compact array.
          const remap = new Map(hardwareIdx.map((oldIndex, nextIndex) => [oldIndex, nextIndex]));
          node.geometry.groups.forEach((group) => {
            group.materialIndex = remap.get(group.materialIndex) ?? 0;
          });
          node.visible = true;
          node.userData.charmPinMesh = true;
          return;
        }
      }

      if (hardwareIdx.length && !bodyIdx.length) {
        node.visible = true;
        node.userData.charmPinMesh = true;
        return;
      }
      if (!hardwareIdx.length && bodyIdx.length) {
        node.visible = false;
        node.userData.charmForceHidden = true;
        return;
      }
      // Multi-material without groups: hiding opacity alone still draws the body hull.
      // Keep the node but mark it so slab setup can drop it entirely.
      if (hardwareIdx.length && bodyIdx.length) {
        node.userData.charmNeedsPinExtract = true;
      }
    });
  }

  function stripCharmBodyMeshesForSlab(cloned) {
    if (!cloned) return;
    const remove = [];
    cloned.traverse((node) => {
      if (!(node.isMesh || node.isSkinnedMesh)) return;
      if (node.userData?.hangArt || node.userData?.charmPinMesh) return;
      remove.push(node);
    });
    remove.forEach((node) => {
      node.userData.charmForceHidden = true;
      node.visible = false;
      // Detach only — geometry/materials may still be shared with the charm template.
      node.parent?.remove(node);
    });
  }

  function prepareCharmGltfFittedTemplate(gltf, three) {
    if (charmGltfFittedTemplate) return charmGltfFittedTemplate;
    if (!gltf?.scene) return null;

    const source = three.SkeletonUtils?.clone
      ? three.SkeletonUtils.clone(gltf.scene)
      : gltf.scene.clone(true);
    if (!source) return null;

    source.updateMatrixWorld(true);

    const isHardwareNode = (node) => {
      if (!node?.material) return false;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const hardware = materials.filter((material) => (
        CHARM_HARDWARE_MATERIAL_RE.test(String(material?.name || "").toLowerCase())
      ));
      const body = materials.filter((material) => (
        CHARM_BODY_MATERIAL_RE.test(String(material?.name || "").toLowerCase())
      ));
      // Pure chain/clip mesh (weapon charms ship these separately).
      return hardware.length > 0 && body.length === 0;
    };

    // Body-only bounds — native chain is replaced by the standard pin, and including
    // it leaves a huge empty gap under the clasp once the chain is hidden.
    let bodyBox = new three.Box3();
    let hasBody = false;
    source.traverse((node) => {
      if (!(node.isSkinnedMesh || node.isMesh)) return;
      node.frustumCulled = false;
      node.visible = true;
      if (node.isSkinnedMesh && node.skeleton) node.skeleton.update();
      if (isHardwareNode(node)) return;
      bodyBox.expandByObject(node);
      hasBody = true;
    });
    if (!hasBody || bodyBox.isEmpty()) {
      bodyBox = new three.Box3().setFromObject(source);
    }

    const rawSize = bodyBox.getSize(new three.Vector3());
    const urlHint = String(charmGltfLoadedUrl || charmGltfLoadingUrl || "").toLowerCase();
    const isMissingLink = /missinglink|wurst/.test(urlHint);
    const isGunCharm = /kc_wpn_|weapon_1/.test(urlHint);
    const isHighlightCharm = isHighlightDogTagHint(urlHint);
    // Real weapon charms (incl. tec9_magma) must not take the grenade yaw path.
    const isGrenadeCharm = !isGunCharm && (
      /kc_db_|drboom|incendiary|flash|hellcat|bombacat|biomech|magma|hot\s*hands/.test(urlHint)
      || isHighlightCharm
    );
    const flatFace = isGunCharm || (
      !isMissingLink && !isGrenadeCharm && rawSize.x < Math.max(rawSize.y, rawSize.z) * 0.7
    );

    // CS2 keychain node matrices already map Source hang (-Z) → viewer (-Y).
    // Re-applying rotateX(-π/2) tips Hot Hands / gun charms into a sideways "levitate" pose.
    const span = Math.max(rawSize.x, rawSize.y, rawSize.z, 0.001);
    const alreadyHangY = bodyBox.max.y <= span * 0.25
      && (bodyBox.max.y - bodyBox.min.y) >= Math.min(rawSize.x, rawSize.z) * 0.5;

    source.rotation.set(0, 0, 0);
    if (isHighlightCharm) {
      // Rotation applied after unit-scale via alignDogTagHangDown (hang on -Y).
    } else if (isGunCharm) {
      // Matrix already hangs on -Y — only yaw. −π/2 puts the muzzle to screen-left
      // (matching the host weapon). +π/2 left barrels pointing at the grip.
      source.rotateY(-Math.PI / 2);
    } else if (alreadyHangY) {
      // After the node matrix: Source +Y (face/eyes) → scene +X.
      // Yaw eyes onto +Z (weapon-forward). Missing Link must NOT skip this — 0 left them in profile.
      if (isMissingLink) {
        source.rotateY(Math.PI / 2); // eyes → +Z forward
      } else if (isGrenadeCharm || flatFace || rawSize.x <= rawSize.z * 0.92) {
        // Opposite of prior -π/2 — grenade logos were facing away.
        source.rotateY(Math.PI / 2);
      } else if (rawSize.z < rawSize.x * 0.85) {
        source.rotateY(Math.PI);
      }
    } else if (rawSize.z >= rawSize.y * 1.05) {
      // Legacy / pin-like assets that still hang along Source -Z.
      source.rotateX(-Math.PI / 2);
      if (isMissingLink) source.rotateY(Math.PI / 2);
      else if (flatFace) source.rotateY(-Math.PI / 2); // gun silhouettes: muzzle left
      else source.rotateY(Math.PI / 2); // grenades: flipped 180° from prior -π/2
    }
    source.updateMatrixWorld(true);
    source.traverse((node) => {
      if (node.isSkinnedMesh && node.skeleton) node.skeleton.update();
    });
    bodyBox = new three.Box3();
    hasBody = false;
    source.traverse((node) => {
      if (!(node.isSkinnedMesh || node.isMesh) || isHardwareNode(node)) return;
      bodyBox.expandByObject(node);
      hasBody = true;
    });
    if (!hasBody || bodyBox.isEmpty()) bodyBox = new three.Box3().setFromObject(source);

    // Dog-tags: force hang axis onto -Y before unit-scale so height is the tag length.
    if (isHighlightCharm) {
      alignDogTagHangDown(source, three);
      bodyBox = new three.Box3().setFromObject(source);
    }

    const bodySize = bodyBox.getSize(new three.Vector3());
    const bodyHeight = Math.max(bodySize.y, bodySize.x * 0.35, 0.001);
    const unitScale = 1 / bodyHeight;
    source.scale.multiplyScalar(unitScale);
    source.updateMatrixWorld(true);
    source.traverse((node) => {
      if (node.isSkinnedMesh && node.skeleton) node.skeleton.update();
    });

    // Seat tip at origin — dog-tags re-latch joint1 after scale.
    if (isHighlightCharm) {
      snapCharmTipBoneToLocalOrigin(source, three)
        || snapCharmBodyTopToLocalOrigin(source, three, { preferTipBone: true, includeHardware: true });
    } else {
      bodyBox = new three.Box3();
      hasBody = false;
      source.traverse((node) => {
        if (!(node.isSkinnedMesh || node.isMesh) || isHardwareNode(node)) return;
        bodyBox.expandByObject(node);
        hasBody = true;
      });
      if (!hasBody || bodyBox.isEmpty()) bodyBox = new three.Box3().setFromObject(source);

      const attachWorld = new three.Vector3(
        (bodyBox.min.x + bodyBox.max.x) * 0.5,
        bodyBox.max.y,
        (bodyBox.min.z + bodyBox.max.z) * 0.5
      );
      // Source is still at the origin — shift so the body top lands on (0,0,0).
      source.position.set(-attachWorld.x, -attachWorld.y, -attachWorld.z);
      source.updateMatrixWorld(true);
    }

    source.traverse((node) => {
      node.userData.craftPart = true;
      node.frustumCulled = false;
    });

    charmGltfFittedTemplate = source;
    return charmGltfFittedTemplate;
  }

  function loadCharmGltfTemplate(three, modelUrl = CHARM_GLB_DEFAULT) {
    const url = String(modelUrl || CHARM_GLB_DEFAULT).trim();
    if (charmGltfFittedTemplate && charmGltfLoadedUrl === url) {
      return Promise.resolve(charmGltfTemplate);
    }
    if (charmGltfTemplatePromise && charmGltfLoadingUrl === url) return charmGltfTemplatePromise;
    if (!window.THREE?.GLTFLoader) return Promise.resolve(null);

    charmGltfLoadingUrl = url;
    const loadToken = url;
    charmGltfTemplatePromise = new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = window.setTimeout(() => finish(null), 8000);
      const loader = new window.THREE.GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          window.clearTimeout(timer);
          // Ignore stale loads when the user switches charms quickly.
          if (charmGltfLoadingUrl !== loadToken) {
            finish(null);
            return;
          }
          charmGltfTemplate = gltf;
          charmGltfLoadedUrl = url;
          charmGltfFittedTemplate = null;
          prepareCharmGltfFittedTemplate(gltf, three);
          finish(gltf);
        },
        undefined,
        () => {
          window.clearTimeout(timer);
          if (charmGltfLoadingUrl === loadToken) {
            charmGltfTemplatePromise = null;
            charmGltfLoadingUrl = "";
          }
          finish(null);
        }
      );
    });
    return charmGltfTemplatePromise;
  }

  function isHighlightDogTagHint(value) {
    const hint = String(value || "");
    return /kc_aus2025|kc_bud2025|kc_cologne2026|aus2025|bud2025|cologne2026|austin\s*2025|budapest\s*2025|cologne\s*2026/i.test(hint)
      || /\b(?:Austin|Budapest|Cologne)\s*202[56]\s*Highlight\b/i.test(hint);
  }

  function findCharmTailBone(root) {
    if (!root) return null;
    let tail = null;
    root.traverse((node) => {
      if (tail) return;
      if (node.isBone && /^joint3$/i.test(String(node.name || ""))) tail = node;
    });
    if (tail) return tail;
    root.traverse((node) => {
      if (tail || !node.isSkinnedMesh || !node.skeleton?.bones) return;
      const bones = node.skeleton.bones;
      tail = bones.find((bone) => /^joint3$/i.test(String(bone.name || "")))
        || bones[bones.length - 1]
        || null;
    });
    return tail;
  }

  /**
   * Tournament dog-tags: bind pose has the card in XZ (faces on ±Y).
   * Pitch onto local -Y hang, then yaw 180° so the printed face is local +Z
   * (world-lock shows the text to the camera, not the blank back).
   */
  function alignDogTagHangDown(object, three) {
    if (!object || !three) return;
    object.rotation.set(0, 0, 0);
    object.updateMatrixWorld(true);
    object.traverse((node) => {
      if (node.isSkinnedMesh && node.skeleton) {
        try { node.skeleton.update(); } catch (_error) { /* ignore */ }
      }
    });

    object.rotateX(-Math.PI / 2);
    object.rotateY(Math.PI);
    object.updateMatrixWorld(true);

    snapCharmTipBoneToLocalOrigin(object, three)
      || snapCharmBodyTopToLocalOrigin(object, three, { preferTipBone: true, includeHardware: true });

    ensureDogTagMassHangsBelow(object, three);
  }

  function ensureDogTagMassHangsBelow(object, three) {
    if (!object || !three) return;
    object.updateMatrixWorld(true);
    const box = new three.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new three.Vector3());
    // More of the tag above the tip than below → flip 180° around X so it hangs down.
    if (center.y > 0.002 || box.max.y > Math.abs(box.min.y) * 0.55) {
      object.rotateX(Math.PI);
      object.updateMatrixWorld(true);
      snapCharmTipBoneToLocalOrigin(object, three)
        || snapCharmBodyTopToLocalOrigin(object, three, { preferTipBone: true, includeHardware: true });
    }
  }

  // r128's Raycaster ignores skinning, so on skinned weapon bakes the posed mesh
  // the user sees sits away from the geometry hit-tests use — sticker/charm
  // hover and placement then miss toward the extremities. Freeze the current
  // pose into static geometry so drawing and hit-testing agree.
  function bakeSkinnedWeaponMeshes(modelRoot, three) {
    if (!modelRoot || !three) return false;
    const skinned = [];
    modelRoot.traverse((node) => {
      if (node.isSkinnedMesh && node.skeleton?.bones?.length && node.geometry?.attributes?.position
        && node.geometry.attributes.skinIndex && node.geometry.attributes.skinWeight) {
        skinned.push(node);
      }
    });
    if (!skinned.length) return false;

    modelRoot.updateMatrixWorld(true);
    const blended = new three.Matrix4();
    const full = new three.Matrix4();
    const idx = new three.Vector4();
    const wt = new three.Vector4();
    const p = new three.Vector3();
    const n = new three.Vector3();
    const accum = new Array(16);

    skinned.forEach((mesh) => {
      mesh.skeleton.update();
      const src = mesh.geometry;
      const boneMats = mesh.skeleton.bones.map((bone, k) => (
        new three.Matrix4().multiplyMatrices(bone.matrixWorld, mesh.skeleton.boneInverses[k])
      ));
      const geometry = src.clone();
      const pos = geometry.attributes.position;
      const nrm = geometry.attributes.normal || null;
      const skinIndex = src.attributes.skinIndex;
      const skinWeight = src.attributes.skinWeight;
      for (let i = 0; i < pos.count; i += 1) {
        idx.fromBufferAttribute(skinIndex, i);
        wt.fromBufferAttribute(skinWeight, i);
        accum.fill(0);
        let totalWeight = 0;
        for (let k = 0; k < 4; k += 1) {
          const weight = wt.getComponent(k);
          const boneMat = boneMats[idx.getComponent(k)];
          if (!weight || !boneMat) continue;
          totalWeight += weight;
          const e = boneMat.elements;
          for (let j = 0; j < 16; j += 1) accum[j] += e[j] * weight;
        }
        if (totalWeight <= 0) continue;
        blended.fromArray(accum);
        full.copy(mesh.bindMatrixInverse).multiply(blended).multiply(mesh.bindMatrix);
        p.fromBufferAttribute(src.attributes.position, i).applyMatrix4(full);
        pos.setXYZ(i, p.x, p.y, p.z);
        if (nrm) {
          n.fromBufferAttribute(src.attributes.normal, i).transformDirection(full);
          nrm.setXYZ(i, n.x, n.y, n.z);
        }
      }
      pos.needsUpdate = true;
      if (nrm) nrm.needsUpdate = true;
      geometry.deleteAttribute("skinIndex");
      geometry.deleteAttribute("skinWeight");
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const baked = new three.Mesh(geometry, mesh.material);
      baked.name = mesh.name;
      baked.userData = mesh.userData;
      baked.visible = mesh.visible;
      baked.renderOrder = mesh.renderOrder;
      baked.frustumCulled = mesh.frustumCulled;
      baked.castShadow = mesh.castShadow;
      baked.receiveShadow = mesh.receiveShadow;
      baked.layers.mask = mesh.layers.mask;
      baked.position.copy(mesh.position);
      baked.quaternion.copy(mesh.quaternion);
      baked.scale.copy(mesh.scale);
      const parent = mesh.parent;
      const slot = parent ? parent.children.indexOf(mesh) : -1;
      if (!parent || slot < 0) return;
      parent.children[slot] = baked;
      baked.parent = parent;
      mesh.parent = null;
      baked.updateMatrixWorld(true);
    });
    modelRoot.updateMatrixWorld(true);
    return true;
  }

  function fortifyCharmGltfClone(cloned, three) {
    if (!cloned || !three) return cloned;

    // Tournament dog-tags: keep the skinned rest pose. Bind-pose bake stretches the
    // chain/tag and makes them look huge / sideways instead of hanging normally.
    if (isHighlightDogTagHint(charmGltfLoadedUrl || charmGltfLoadingUrl)) {
      cloned.updateMatrixWorld(true);
      cloned.traverse((node) => {
        node.frustumCulled = false;
        if (node.isSkinnedMesh && node.skeleton) {
          try {
            node.skeleton.update();
          } catch (_error) {
            // Ignore skeleton races.
          }
        }
      });
      return cloned;
    }

    const skinnedNodes = [];
    cloned.traverse((node) => {
      if (node.isSkinnedMesh) skinnedNodes.push(node);
    });

    skinnedNodes.forEach((skinned) => {
      try {
        // Bind-pose bake — otherwise deformed skin UVs scramble gun-charm paint.
        if (skinned.skeleton?.boneInverses && skinned.skeleton?.bones) {
          skinned.skeleton.pose?.();
        }
        skinned.skeleton?.update?.();
        skinned.updateMatrixWorld(true);
      } catch (_error) {
        // Ignore skeleton races.
      }

      const parent = skinned.parent;
      if (!parent) return;

      // Bake to a static mesh so r128 skinning quirks cannot hide the charm.
      const mesh = new three.Mesh(skinned.geometry, skinned.material);
      mesh.name = skinned.name || "charm-static";
      mesh.frustumCulled = false;
      mesh.renderOrder = 60;
      mesh.visible = true;
      mesh.userData = { ...skinned.userData, craftPart: true };

      parent.updateMatrixWorld(true);
      const invParent = new three.Matrix4().copy(parent.matrixWorld).invert();
      const local = new three.Matrix4().multiplyMatrices(invParent, skinned.matrixWorld);
      local.decompose(mesh.position, mesh.quaternion, mesh.scale);

      parent.add(mesh);
      parent.remove(skinned);
    });

    cloned.updateMatrixWorld(true);
    return cloned;
  }

  function charmCloneLooksVisible(cloned, three, charmSize) {
    if (!cloned || !three) return false;
    cloned.updateMatrixWorld(true);
    const box = new three.Box3().setFromObject(cloned);
    if (box.isEmpty()) return false;
    const size = box.getSize(new three.Vector3());
    const span = Math.max(size.x, size.y, size.z);
    const minSpan = Math.max((Number(charmSize) || 0.05) * 0.15, 0.008);
    const maxSpan = Math.max((Number(charmSize) || 0.05) * 8, 0.5);
    return span >= minSpan && span <= maxSpan && countCharmMeshes(cloned) > 0;
  }

  function cloneCharmScene(_gltf, three) {
    const template = charmGltfFittedTemplate || prepareCharmGltfFittedTemplate(_gltf, three);
    if (!template) return null;
    const cloned = three.SkeletonUtils?.clone
      ? three.SkeletonUtils.clone(template)
      : template.clone(true);
    return fortifyCharmGltfClone(cloned, three);
  }

  function applyCharmPreviewMaterials(object, isPreview) {
    if (!isPreview || !object) return;
    object.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        material.transparent = true;
        material.opacity = Math.min(Number(material.opacity) || 1, 0.88);
        material.needsUpdate = true;
      });
    });
  }

  function fitCharmModelToAnchor(charmObject, three, targetSize, options = {}) {
    // Match CS2 keychain scale on the host weapon (was undersized at ~0.6× target).
    // Slabs need a larger boost — cards were tiny vs rifle/pistol bodies.
    // Dog-tags were also undersized vs pistols (Glock etc.).
    const boost = Boolean(options.isSlab)
      ? 2.05
      : Boolean(options.isHighlightCharm)
        ? 2.05
        : 1.28;
    const scale = Math.max(targetSize * 1.05 * boost, 0.032);
    charmObject.scale.multiplyScalar(scale);
    charmObject.updateMatrixWorld(true);
    charmObject.traverse((node) => {
      node.userData.craftPart = true;
      node.frustumCulled = false;
      if (node.isMesh || node.isSkinnedMesh) {
        if (node.userData?.charmForceHidden) {
          node.visible = false;
        } else {
          node.visible = true;
        }
        node.renderOrder = 60;
        if (node.isSkinnedMesh && node.skeleton) node.skeleton.update();
      }
    });
  }

  function buildCharmSwayGroups(three, model) {
    const ringPivot = new three.Group();
    const linkPivot = new three.Group();
    const bodyPivot = new three.Group();
    ringPivot.userData.craftPart = true;
    // Holds the pin flush on the paint — never simulated (see createCharmJigglePhysics).
    ringPivot.userData.charmRigidPin = true;
    linkPivot.userData.craftPart = true;
    linkPivot.userData.charmHangBody = true;
    bodyPivot.userData.craftPart = true;
    bodyPivot.userData.charmHangBody = true;
    bodyPivot.add(model);
    linkPivot.add(bodyPivot);
    ringPivot.add(linkPivot);
    return { ringPivot, linkPivot, bodyPivot };
  }

  function countCharmMeshes(root) {
    let count = 0;
    root?.traverse?.((node) => {
      if ((node.isMesh || node.isSkinnedMesh) && node.visible !== false) count += 1;
    });
    return count;
  }

  function sampleTextureAlphaPoints(texture, maxSamples = 56) {
    const img = texture?.image;
    const imgW = Number(img?.naturalWidth || img?.width || 0);
    const imgH = Number(img?.naturalHeight || img?.height || 0);
    if (!imgW || !imgH) return null;

    try {
      const canvas = document.createElement("canvas");
      const cols = Math.min(maxSamples, imgW);
      const rows = Math.min(maxSamples, imgH);
      canvas.width = cols;
      canvas.height = rows;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, cols, rows);
      const { data } = ctx.getImageData(0, 0, cols, rows);
      const points = [];
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let colorCount = 0;
      let minX = cols;
      let maxX = 0;
      let minY = rows;
      let maxY = 0;

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const i = (y * cols + x) * 4;
          const alpha = data[i + 3];
          if (alpha < 40) continue;
          points.push({ x, y });
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          if (alpha > 110) {
            rSum += data[i];
            gSum += data[i + 1];
            bSum += data[i + 2];
            colorCount += 1;
          }
        }
      }

      if (!points.length) return null;
      const edgeColor = colorCount
        ? (
          (Math.round(rSum / colorCount) << 16)
          | (Math.round(gSum / colorCount) << 8)
          | Math.round(bSum / colorCount)
        )
        : 0x3f4654;

      return {
        points,
        cols,
        rows,
        minX,
        maxX,
        minY,
        maxY,
        edgeColor: edgeColor & 0xffffff,
      };
    } catch (_error) {
      return null;
    }
  }

  function convexHull2D(points) {
    if (!points?.length) return [];
    const sorted = points.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (let i = 0; i < sorted.length; i += 1) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) {
        lower.pop();
      }
      lower.push(sorted[i]);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) {
        upper.pop();
      }
      upper.push(sorted[i]);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  function mergeBoxGeometries(boxes, three) {
    if (!boxes.length) return null;
    if (typeof three.BufferGeometryUtils?.mergeBufferGeometries === "function") {
      return three.BufferGeometryUtils.mergeBufferGeometries(boxes, false);
    }
    // Manual merge for Three r128 without BufferGeometryUtils.
    let vertexCount = 0;
    let indexCount = 0;
    boxes.forEach((geo) => {
      vertexCount += geo.attributes.position.count;
      indexCount += geo.index ? geo.index.count : geo.attributes.position.count;
    });
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(indexCount);
    let vOffset = 0;
    let iOffset = 0;
    let indexBase = 0;
    boxes.forEach((geo) => {
      const pos = geo.attributes.position.array;
      const nor = geo.attributes.normal?.array;
      positions.set(pos, vOffset * 3);
      if (nor) normals.set(nor, vOffset * 3);
      if (geo.index) {
        const src = geo.index.array;
        for (let i = 0; i < src.length; i += 1) {
          indices[iOffset + i] = src[i] + indexBase;
        }
        iOffset += src.length;
      }
      indexBase += geo.attributes.position.count;
      vOffset += geo.attributes.position.count;
      geo.dispose?.();
    });
    const merged = new three.BufferGeometry();
    merged.setAttribute("position", new three.BufferAttribute(positions, 3));
    merged.setAttribute("normal", new three.BufferAttribute(normals, 3));
    merged.setIndex(new three.BufferAttribute(indices, 1));
    return merged;
  }

  function buildVoxelCharmBody(texture, width, height, three, isPreview) {
    const sample = sampleTextureAlphaPoints(texture, 28);
    if (!sample) return null;
    const spanX = Math.max(sample.maxX - sample.minX, 1);
    const spanY = Math.max(sample.maxY - sample.minY, 1);
    const cellW = width / spanX;
    const cellH = height / spanY;
    const depth = Math.max(width, height) * 0.28;
    const boxes = [];

    sample.points.forEach((pt) => {
      const x = ((pt.x - sample.minX + 0.5) / spanX - 0.5) * width;
      const y = (0.5 - (pt.y - sample.minY + 0.5) / spanY) * height;
      const box = new three.BoxGeometry(cellW * 0.98, cellH * 0.98, depth);
      box.translate(x, y, 0);
      boxes.push(box);
    });

    const merged = mergeBoxGeometries(boxes, three);
    if (!merged) return null;
    const mat = new three.MeshBasicMaterial({
      color: sample.edgeColor || 0x3f4654,
      transparent: isPreview,
      opacity: isPreview ? 0.92 : 1,
      depthWrite: true,
    });
    const mesh = new three.Mesh(merged, mat);
    mesh.userData.craftPart = true;
    return { mesh, depth, edgeColor: sample.edgeColor || 0x3f4654 };
  }

  function buildRoundedCharmCard(width, height, three, isPreview, edgeColor = 0x3f4654) {
    const depth = Math.max(width, height) * 0.26;
    let geometry = null;
    if (three.Shape && three.ExtrudeGeometry) {
      const radius = Math.min(width, height) * 0.12;
      const hw = width * 0.5;
      const hh = height * 0.5;
      const shape = new three.Shape();
      shape.moveTo(-hw + radius, -hh);
      shape.lineTo(hw - radius, -hh);
      shape.quadraticCurveTo(hw, -hh, hw, -hh + radius);
      shape.lineTo(hw, hh - radius);
      shape.quadraticCurveTo(hw, hh, hw - radius, hh);
      shape.lineTo(-hw + radius, hh);
      shape.quadraticCurveTo(-hw, hh, -hw, hh - radius);
      shape.lineTo(-hw, -hh + radius);
      shape.quadraticCurveTo(-hw, -hh, -hw + radius, -hh);
      geometry = new three.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: depth * 0.18,
        bevelSize: Math.min(width, height) * 0.04,
        bevelSegments: 2,
        curveSegments: 8,
      });
      geometry.translate(0, 0, -depth * 0.5);
    } else {
      geometry = new three.BoxGeometry(width * 0.94, height * 0.94, depth);
    }
    const mat = new three.MeshBasicMaterial({
      color: edgeColor,
      transparent: isPreview,
      opacity: isPreview ? 0.92 : 1,
      depthWrite: true,
    });
    const mesh = new three.Mesh(geometry, mat);
    mesh.userData.craftPart = true;
    return { mesh, depth, edgeColor };
  }

  function buildCharmExtrudeBody(texture, width, height, three, isPreview) {
    const voxel = buildVoxelCharmBody(texture, width, height, three, isPreview);
    if (voxel) return voxel;

    const sample = sampleTextureAlphaPoints(texture, 40);
    if (sample && three.ExtrudeGeometry && three.Shape) {
      const hull = convexHull2D(sample.points);
      if (hull.length >= 3) {
        const spanX = Math.max(sample.maxX - sample.minX, 1);
        const spanY = Math.max(sample.maxY - sample.minY, 1);
        const shape = new three.Shape();
        hull.forEach((pt, index) => {
          const x = ((pt.x - sample.minX) / spanX - 0.5) * width;
          const y = (0.5 - (pt.y - sample.minY) / spanY) * height;
          if (index === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        });
        shape.closePath();
        const depth = Math.max(width, height) * 0.26;
        const geometry = new three.ExtrudeGeometry(shape, {
          depth,
          bevelEnabled: true,
          bevelThickness: depth * 0.2,
          bevelSize: Math.min(width, height) * 0.03,
          bevelSegments: 2,
          curveSegments: 6,
        });
        geometry.translate(0, 0, -depth * 0.5);
        const edgeMat = new three.MeshBasicMaterial({
          color: sample.edgeColor || 0x3f4654,
          transparent: isPreview,
          opacity: isPreview ? 0.92 : 1,
          depthWrite: true,
        });
        const mesh = new three.Mesh(geometry, edgeMat);
        mesh.userData.craftPart = true;
        return { mesh, depth, edgeColor: sample.edgeColor || 0x3f4654 };
      }
    }

    return buildRoundedCharmCard(width, height, three, isPreview);
  }

  function measureVisiblePinBottom(cloned, three) {
    cloned.updateMatrixWorld(true);
    const box = new three.Box3();
    let found = false;
    cloned.traverse((node) => {
      if ((!node.isMesh && !node.isSkinnedMesh) || node.visible === false) return;
      if (node.userData?.hangArt) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const looksHardware = materials.some((material) => {
        const name = String(material?.name || "").toLowerCase();
        return /chain|link|ring|carabiner|metal|hardware|attach|kc_db_chain/.test(name)
          || (material && material.opacity > 0.2 && material.visible !== false);
      });
      if (!looksHardware) return;
      box.expandByObject(node);
      found = true;
    });
    if (!found || box.isEmpty()) return -0.22;
    // Convert world min/max into cloned-local Y, then climb off the absolute AABB min
    // so dangling verts don't leave the hang body floating under the ring.
    const worldMin = new three.Vector3(
      (box.min.x + box.max.x) * 0.5,
      box.min.y,
      (box.min.z + box.max.z) * 0.5
    );
    const worldMax = new three.Vector3(
      (box.min.x + box.max.x) * 0.5,
      box.max.y,
      (box.min.z + box.max.z) * 0.5
    );
    cloned.worldToLocal(worldMin);
    cloned.worldToLocal(worldMax);
    if (!Number.isFinite(worldMin.y)) return -0.22;
    const span = Math.max(Math.abs(worldMax.y - worldMin.y), 0.04);
    return worldMin.y + span * 0.22;
  }

  function buildCharmChainLinks(three, fromY, toY, isPreview) {
    const group = new three.Group();
    group.userData.craftPart = true;
    group.userData.hangArt = true;
    const span = Math.max(fromY - toY, 0.08);
    const metal = new three.MeshBasicMaterial({
      color: 0x8b939e,
      transparent: isPreview,
      opacity: isPreview ? 0.92 : 1,
    });
    const brass = new three.MeshBasicMaterial({
      color: 0xb45309,
      transparent: isPreview,
      opacity: isPreview ? 0.92 : 1,
    });

    const linkCount = Math.max(2, Math.min(4, Math.round(span / 0.11)));
    for (let i = 0; i < linkCount; i += 1) {
      const t = (i + 0.5) / linkCount;
      const y = fromY - span * t;
      const ring = new three.Mesh(
        new three.TorusGeometry(0.045, 0.012, 8, 14),
        i % 2 === 0 ? metal : brass
      );
      ring.userData.craftPart = true;
      ring.userData.hangArt = true;
      ring.position.set(0, y, 0.01);
      ring.rotation.y = (i % 2) * (Math.PI / 2);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    const stem = new three.Mesh(
      new three.CylinderGeometry(0.01, 0.01, span * 0.92, 8),
      metal
    );
    stem.userData.craftPart = true;
    stem.userData.hangArt = true;
    stem.position.set(0, (fromY + toY) * 0.5, 0);
    group.add(stem);
    return group;
  }

  function prepareCharmFigurineTexture(texture, three) {
    if (!texture) return null;
    // Reuse one prepared map; cloning would double GPU memory per charm.
    texture.encoding = three.sRGBEncoding;
    if ("colorSpace" in texture && three.SRGBColorSpace) {
      texture.colorSpace = three.SRGBColorSpace;
    }
    texture.flipY = true;
    texture.needsUpdate = true;
    return texture;
  }

  function buildBallCharmFigurine(texture, width, height, three, isPreview) {
    const size = Math.max(width, height, 0.4);
    const radius = size * 0.48;
    const sx = Math.min(width / size, 1) * 0.98;
    const sy = Math.min(height / size, 1) * 1.08;
    const sz = 0.82;
    const rx = radius * sx;
    const ry = radius * sy;
    const rz = radius * sz;

    const map = prepareCharmFigurineTexture(texture, three);
    const sample = sampleTextureAlphaPoints(texture, 48);

    // Chubby ellipsoid — keep full volume so the charm art can cover the whole body.
    const geometry = new three.SphereGeometry(radius, 48, 32);
    geometry.scale(sx, sy, sz);

    const pos = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    const opaque = new Set();
    if (sample) {
      sample.points.forEach((pt) => opaque.add(`${pt.x},${pt.y}`));
    }

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      let z = pos.getZ(i);

      // Planar UVs: charm PNG faces forward across the ball (same framing as the catalog icon).
      const u = 0.5 + (x / Math.max(rx * 2, 1e-4));
      const v = 0.5 + (y / Math.max(ry * 2, 1e-4));
      uvs.setXY(i, u, v);

      // Mild relief only — never collapse transparent verts (that hid the texture behind a solid core).
      if (sample) {
        const spanX = Math.max(sample.maxX - sample.minX, 1);
        const spanY = Math.max(sample.maxY - sample.minY, 1);
        const px = Math.round(sample.minX + (u * spanX));
        const py = Math.round(sample.minY + ((1 - v) * spanY));
        const hit = opaque.has(`${px},${py}`)
          || opaque.has(`${px + 1},${py}`)
          || opaque.has(`${px - 1},${py}`)
          || opaque.has(`${px},${py + 1}`)
          || opaque.has(`${px},${py - 1}`);
        if (hit && z > 0) {
          z *= 1.08;
          pos.setZ(i, z);
        }
      }
    }

    pos.needsUpdate = true;
    uvs.needsUpdate = true;
    geometry.computeVertexNormals();

    const bodyMat = new three.MeshBasicMaterial({
      map: map || undefined,
      color: 0xffffff,
      transparent: true,
      opacity: isPreview ? 0.95 : 1,
      alphaTest: 0.08,
      side: three.DoubleSide,
      depthWrite: true,
    });

    // Soft fill sphere uses the SAME charm texture (no solid pink/gray core).
    // Lower alphaTest so sparse icons still read as a ball, with art tinted on every face.
    const fillMat = new three.MeshBasicMaterial({
      map: map || undefined,
      color: 0xffffff,
      transparent: true,
      opacity: isPreview ? 0.88 : 0.94,
      alphaTest: 0.02,
      side: three.FrontSide,
      depthWrite: false,
    });
    const fillGeo = new three.SphereGeometry(radius * 0.72, 24, 16);
    fillGeo.scale(sx * 0.92, sy * 0.92, sz * 0.88);
    const fillUvs = fillGeo.attributes.uv;
    const fillPos = fillGeo.attributes.position;
    const fillRx = radius * 0.72 * sx * 0.92;
    const fillRy = radius * 0.72 * sy * 0.92;
    for (let i = 0; i < fillPos.count; i += 1) {
      const u = 0.5 + (fillPos.getX(i) / Math.max(fillRx * 2, 1e-4));
      const v = 0.5 + (fillPos.getY(i) / Math.max(fillRy * 2, 1e-4));
      fillUvs.setXY(i, u, v);
    }
    fillUvs.needsUpdate = true;

    const group = new three.Group();
    group.userData.craftPart = true;
    group.userData.hangArt = true;
    const fill = new three.Mesh(fillGeo, fillMat);
    fill.userData.craftPart = true;
    fill.userData.hangArt = true;
    fill.renderOrder = 60;
    const shell = new three.Mesh(geometry, bodyMat);
    shell.userData.craftPart = true;
    shell.userData.hangArt = true;
    shell.renderOrder = 61;
    group.add(fill, shell);
    return { mesh: group, depth: rz * 2, height: ry * 2, width: rx * 2 };
  }

  function attachHangArtToCharmModel(cloned, texture, charmSize, three, isPreview, options = {}) {
    if (!texture || !cloned) return;
    const isSlab = Boolean(options.isSlab);
    const map = prepareCharmFigurineTexture(texture, three);
    const faceMat = new three.MeshBasicMaterial({
      map: map || undefined,
      color: 0xffffff,
      transparent: true,
      opacity: isPreview ? 0.95 : 1,
      alphaTest: isSlab ? 0.05 : 0.14,
      side: three.DoubleSide,
      depthWrite: true,
    });

    // Unit-local sizes (GLTF is normalized to height ~1, then scaled once).
    let width = isSlab ? 1.3 : 0.95;
    let height = isSlab ? 0.88 : 1.05;
    const img = texture.image;
    const imgW = Number(img?.naturalWidth || img?.width || 0);
    const imgH = Number(img?.naturalHeight || img?.height || 0);
    if (imgW > 0 && imgH > 0) {
      const aspect = imgW / imgH;
      if (isSlab) {
        // Normal keychain slab scale vs the host weapon (~65% smaller than prior).
        width = 1.3;
        height = width / Math.max(aspect, 0.45);
        height = Math.min(Math.max(height, 0.75), 1.15);
      } else {
        // Character charms are closer to square/ball than a tall card.
        const target = 1.05;
        if (aspect >= 1) {
          width = target;
          height = target / Math.min(aspect, 1.35);
        } else {
          height = target;
          width = target * Math.max(aspect, 0.75);
        }
      }
    }

    const hang = new three.Group();
    hang.userData.craftPart = true;
    hang.userData.hangArt = true;
    hang.userData.charmHangBody = true;

    const pinBottom = options.isSlab ? 0 : measureVisiblePinBottom(cloned, three);
    // Latch crown into the pin circle (slabs: light nest onto tip rivet, hang below).
    const nest = Math.max(charmSize * (options.isSlab ? 0.05 : 0.045), options.isSlab ? 0.0025 : 0.0025);
    let charmTopY = pinBottom + nest;
    let charmCenterY = charmTopY - height * 0.5;

    if (isSlab) {
      const depth = 0.03;
      const front = new three.Mesh(new three.PlaneGeometry(width, height), faceMat);
      front.userData.craftPart = true;
      front.userData.hangArt = true;
      front.position.z = depth * 0.5;
      const back = new three.Mesh(new three.PlaneGeometry(width, height), faceMat.clone());
      back.userData.craftPart = true;
      back.userData.hangArt = true;
      back.position.z = -depth * 0.5;
      back.rotation.y = Math.PI;
      hang.add(front, back);
      // Slight raise so the painted eyelet meets the tip without burying the card.
      charmCenterY += height * 0.04;
      // No torus clip / circle links on slabs — tip pin seats the card crown directly.
    } else {
      // 3D ball/figurine charm (not a rectangle card).
      const figurine = buildBallCharmFigurine(texture, width, height, three, isPreview);
      hang.add(figurine.mesh);
      height = figurine.height || height;
      charmTopY = pinBottom + nest;
      charmCenterY = charmTopY - height * 0.5;

      const bail = new three.Mesh(
        new three.TorusGeometry(0.055, 0.015, 8, 16),
        new three.MeshBasicMaterial({
          color: 0x9aa3b2,
          transparent: isPreview,
          opacity: isPreview ? 0.92 : 1,
        })
      );
      bail.userData.craftPart = true;
      bail.userData.hangArt = true;
      bail.rotation.x = Math.PI / 2;
      // Bail sits at the charm crown so it threads the pin circle.
      bail.position.set(0, height * 0.5 - 0.01, 0);
      hang.add(bail);
    }

    hang.position.set(0, charmCenterY, 0);
    // No separate chain — bail is the connection through the pin.

    hang.traverse((node) => {
      node.frustumCulled = false;
      if (node.isMesh) node.renderOrder = 62;
    });
    cloned.add(hang);
  }

  function attachCharmModelFromGltf(modelRoot, hit, charm, charmSize, three, options, gltf, texture = null) {
    if (isCharmAttachStale(modelRoot, options)) return null;
    const cloned = cloneCharmScene(gltf, three);
    if (!cloned || !hit?.point) return null;

    const isPreview = Boolean(options.isPreview);
    const isSlab = String(charm?.market_hash_name || "").startsWith("Sticker Slab |");
    const hasCustomModel = Boolean(String(charm?.model3d || charm?.gltf || charm?.model_url || "").trim());
    const charmRef = String(
      charm?.model_url || charm?.model_token || charmGltfLoadedUrl || charm?.market_hash_name || ""
    );
    const charmName = String(charm?.market_hash_name || charm?.display_name || "");
    const isMissingLink = /missinglink|wurst|hot\s*wurst|missing\s*link/i.test(`${charmRef} ${charmName}`);
    const keepNativeHoldPin = Boolean(charm?.nativeHoldPin || charm?.native_hold_pin)
      || isNativeHoldPinCharmHint(charmRef, charmName, charm);
    const nativeHoldPinGrenade = isNativeHoldPinGrenadeHint(charmRef, charmName, charm);
    // wurst / catchup / diner still match isSausageCharmHint; nativeHoldPin
    // replacements must not take the old eyelet-latch + kc_pin ring path.
    const isSausageCharm = isSausageCharmHint(`${charmRef} ${charmName}`);
    const useSausageLatch = isSausageCharm && !keepNativeHoldPin;
    const isHighlightCharm = isHighlightDogTagHint(`${charmRef} ${charmName}`);
    const isGunCharm = /kc_wpn_|weapon_1|small\s*arms/i.test(`${charmRef} ${charmName}`);
    // Bombastic / kc_db_* stay grenades even when they keep the native clasp
    // (keepNativeHoldPin used to zero this flag and send them through the bake).
    const isGrenadeCharm = !isGunCharm && !isMissingLink && (
      nativeHoldPinGrenade
      || /kc_db_|drboom|incendiary|flash|hellcat|bombacat|biomech|hot\s*hands|magma|tec9_magma/i.test(`${charmRef} ${charmName}`)
    );
    // Real slab GLTF gets native case/clip materials + sticker face art.
    // Legacy hang-art path only when no slab mesh is available.
    const useHangArt = isSlab && !hasCustomModel && !options.forceSlabGltf;
    applyCharmIconToGltfModel(cloned, texture, three, isPreview, {
      hideBody: useHangArt,
      // Never paint the Steam icon onto a real 3D charm/slab body.
      keepNativeBody: !useHangArt,
    });
    if (isSlab && !useHangArt && texture) {
      attachStickerFaceToSlabModel(cloned, texture, three, isPreview, {
        entry: charm,
        charm,
      });
    }
    if (useHangArt) {
      // Flat Steam card — drop every native mesh (clasp circles included); tip rivet is added below.
      const nativeMeshes = [];
      cloned.traverse((node) => {
        if (node.isMesh || node.isSkinnedMesh) nativeMeshes.push(node);
      });
      nativeMeshes.forEach((node) => {
        node.userData.charmForceHidden = true;
        node.visible = false;
        node.parent?.remove(node);
      });
      attachHangArtToCharmModel(cloned, texture, charmSize, three, isPreview, { isSlab: true });
    } else if (isHighlightCharm) {
      // Dog-tag highlights: hang on -Y, keep native chain, latch through the shared clasp.
      alignDogTagHangDown(cloned, three);
    } else if (isGunCharm) {
      // Small Arms: keep native eyelet + ring (CSGOSkins connected look) — no shared clasp swap.
      snapCharmBodyTopToLocalOrigin(cloned, three, {
        preferTipBone: true,
        includeHardware: true,
      });
    } else if (keepNativeHoldPin) {
      // Native-hold-pin: keep the GLB holding pin; hang upright like Lil' SAS (no kc_pin).
      alignCharacterCharmHangUpright(cloned, three);
    } else if (isMissingLink || (!isSlab && !isGrenadeCharm && !isHighlightCharm)) {
      // Character / sausage: drop native clasp, upright crown on the pin tip.
      hideCharmNativeHardware(cloned);
      alignCharacterCharmHangUpright(cloned, three);
    } else {
      // Grenade: drop native clasp, hang from shared pin + circle.
      hideCharmNativeHardware(cloned);
      snapCharmBodyTopToLocalOrigin(cloned, three, { forGrenadeCharm: isGrenadeCharm });
    }
    fitCharmModelToAnchor(cloned, three, charmSize, { isSlab, isMissingLink, isHighlightCharm });
    // Re-seat after scale so the crown/stud latches under the pin circle.
    if (!useHangArt) {
      if (isHighlightCharm) {
        alignDogTagHangDown(cloned, three);
        // Face is local +Z (toward the camera after world-lock).
        snapCharmTipBoneToLocalOrigin(cloned, three)
          || snapCharmBodyTopToLocalOrigin(cloned, three, { preferTipBone: true, includeHardware: true });
        ensureDogTagMassHangsBelow(cloned, three);
        // Hang in the clasp plane — a Z-shift here floated the chain off the gun.
      } else if (keepNativeHoldPin) {
        alignCharacterCharmHangUpright(cloned, three);
      } else if (isMissingLink || (!isSlab && !isGunCharm && !isGrenadeCharm && !isHighlightCharm)) {
        alignCharacterCharmHangUpright(cloned, three);
      } else {
        snapCharmBodyTopToLocalOrigin(cloned, three, {
          preferTipBone: isGunCharm,
          includeHardware: isGunCharm,
          forGrenadeCharm: isGrenadeCharm,
        });
      }
    }
    if (!isHighlightCharm && !isGunCharm) {
      // Missing Link + character + grenades hang free — never Z-shift (that slid the pin off center).
      seatCharmBackOnPinPlane(cloned, three, {
        isSlab,
        isMissingLink,
        forGrenadeCharm: isGrenadeCharm,
        forCharacterCharm: !isSlab && !isGunCharm && !isGrenadeCharm && !isHighlightCharm,
      });
    }
    if (!charmCloneLooksVisible(cloned, three, charmSize * (isSlab ? 1.4 : 1))) {
      // Still try to attach Missing Link / custom models — visibility heuristics are soft.
      if (!isMissingLink && !hasCustomModel && !isHighlightCharm) {
        disposeCraftNodeTree(cloned);
        return null;
      }
    }

    const anchor = new three.Group();
    const previewKey = resolveCharmPreviewKey(charm);
    anchor.userData = isPreview
      ? { craftPreview: "charm", previewKey, isGltfCharm: true }
      : { craftAttachment: "charm", isGltfCharm: true };

    const attachOptions = {
      ...options,
      modelRoot,
      isSlab,
      isMissingLink,
      isSausageCharm,
      isHighlightCharm,
      isGunCharm,
      isGrenadeCharm,
      keepNativeHoldPin,
      forCharacterCharm: !isSlab && !isGunCharm && !isGrenadeCharm && !isHighlightCharm,
      forMissingLink: isMissingLink && !keepNativeHoldPin,
      sausageLatch: useSausageLatch,
    };
    let ringPivot;
    let linkPivot;
    let bodyPivot;
    {
      const parts = assembleCharmWithStandardPin(cloned, charmSize, three, isPreview, {
        forSlab: isSlab,
        forGunCharm: isGunCharm,
        forDogTag: isHighlightCharm,
        forGrenadeCharm: isGrenadeCharm,
        keepNativeHoldPin,
        forGrenadeNativeHoldPin: nativeHoldPinGrenade,
        // Figurines (Little Guerilla, sausage): CS2 multi-part holding pin.
        // Workshop-blank siblings still hang like figurines; keepNativeHoldPin skips kc_pin only.
        forCharacterCharm: !isSlab && !isGunCharm && !isGrenadeCharm && !isHighlightCharm,
        forMissingLink: isMissingLink && !keepNativeHoldPin,
        sausageLatch: useSausageLatch,
        // Never tip-bone seat character/sausage — joint1 is the side clasp.
        preferTipBone: isHighlightCharm,
        deepLatch: isGunCharm || isHighlightCharm || isGrenadeCharm || useSausageLatch,
        // Gun charms / tags / grenades / sausage eyelet nest into the ring.
        // Other figurines hang under the pin — lifting them spears the comb.
        liftIntoRing: isGunCharm || isHighlightCharm || isGrenadeCharm || useSausageLatch,
        hangFromPin: !useSausageLatch && (
          keepNativeHoldPin
          || isMissingLink
          || (!isSlab && !isGunCharm && !isGrenadeCharm && !isHighlightCharm)
        ),
        missingLinkLatch: isMissingLink && !useSausageLatch && !keepNativeHoldPin,
      });
      const sway = buildCharmSwayGroups(three, parts.body);
      ringPivot = sway.ringPivot;
      linkPivot = sway.linkPivot;
      bodyPivot = sway.bodyPivot;
      linkPivot.position.y = parts.hangY;
      ringPivot.add(parts.pinGroup);
      anchor.add(ringPivot);
    }

    updateCharmAnchorFromHit(anchor, hit, charmSize, three, attachOptions);
    if (isCharmAttachStale(modelRoot, options)) {
      anchor.parent?.remove(anchor);
      disposeCraftNodeTree(anchor);
      return null;
    }

    // Sway starts at the ring under the pin — the pin group stays on the rigid ringPivot.
    const physics = createCharmJigglePhysics(
      [linkPivot, bodyPivot],
      anchor,
      three,
      {
      isSlab,
      isHighlightCharm,
      isMissingLink: /missinglink|wurst/i.test(charmRef),
      isGrenadeCharm,
      isGunCharm,
    });
    anchor.userData.charmPhysics = physics;

    if (isPreview) {
      modelRoot.userData.craftCharmPreviewAnchor = anchor;
      modelRoot.userData.craftCharmPreviewPhysics = physics;
      return anchor;
    }

    return physics;
  }

  function attachCharmModelFallback(modelRoot, hit, charm, charmSize, three, options) {
    const finish = (texture) => {
      if (!hit?.point) return null;
      if (isCharmAttachStale(modelRoot, options)) return null;

      const isSlab = isStickerSlabEntry(charm, options);
      const anchor = new three.Group();
      anchor.userData = options.isPreview
        ? { craftPreview: "charm", previewKey: String(charm?.image || "fallback") }
        : { craftAttachment: "charm" };

      const { ringPivot, linkPivot, bodyPivot } = buildCharmVisualGroup(
        texture,
        charmSize,
        three,
        { ...options, isSlab, entry: charm, charm }
      );
      anchor.add(ringPivot);
      updateCharmAnchorFromHit(anchor, hit, charmSize, three, {
        ...options,
        modelRoot,
        isSlab,
      });
      if (isCharmAttachStale(modelRoot, options)) {
        anchor.parent?.remove(anchor);
        disposeCraftNodeTree(anchor);
        return null;
      }

      const physics = createCharmJigglePhysics(
        [linkPivot, bodyPivot],
        anchor,
        three,
        { isSlab }
      );
      anchor.userData.charmPhysics = physics;

      if (options.isPreview) {
        modelRoot.userData.craftCharmPreviewAnchor = anchor;
        modelRoot.userData.craftCharmPreviewPhysics = physics;
        return anchor;
      }

      return physics;
    };

    const texturePromise = charm?.image
      ? (
        isStickerSlabEntry(charm, options)
          ? loadSlabTexture(charm.image, three)
          : loadCraftTexture(charm.image, three)
      )
      : Promise.resolve(null);
    return Promise.all([loadCharmPinTemplate(three), texturePromise])
      .then(([, texture]) => finish(texture));
  }

  function attachCharmModel(modelRoot, hit, charm, charmSize, three, options = {}) {
    if (!hit?.point) return Promise.resolve();
    if (isCharmAttachStale(modelRoot, options)) return Promise.resolve();
    const attachOptions = { ...options, modelRoot };
    const isSlab = isStickerSlabEntry(charm, options);
    // Slabs always use the textured sticker-plane + clasp path (never the black GLTF case).
    if (isSlab) {
      return attachCharmModelFallback(modelRoot, hit, charm, charmSize, three, {
        ...attachOptions,
        isSlab: true,
      });
    }
    const modelUrl = resolveCharmModelUrl(charm) || CHARM_GLB_DEFAULT;
    const charmName = String(charm?.market_hash_name || charm?.display_name || "");
    const hasDedicatedModel = Boolean(String(charm?.model_url || charm?.model3d || charm?.gltf || "").trim());
    const blockFlatFallback = hasDedicatedModel
      || /missinglink|wurst|hot\s*wurst|missing\s*link|kc_db_|kc_wpn_/i.test(`${modelUrl} ${charmName}`);

    return Promise.all([
      loadCharmGltfTemplate(three, modelUrl),
      loadCharmPinTemplate(three),
      charm?.image ? loadCraftTexture(charm.image, three) : Promise.resolve(null),
    ]).then(([gltf, _pin, texture]) => {
      if (isCharmAttachStale(modelRoot, options)) return null;
      if (gltf) {
        const attached = attachCharmModelFromGltf(
          modelRoot,
          hit,
          charm,
          charmSize,
          three,
          attachOptions,
          gltf,
          texture
        );
        if (attached) return attached;
      }
      // Never fall back to the catalog PNG card (glass plastic frame) for real 3D charms.
      if (blockFlatFallback) return null;
      return attachCharmModelFallback(modelRoot, hit, charm, charmSize, three, attachOptions);
    }).catch(() => (
      blockFlatFallback
        ? null
        : attachCharmModelFallback(modelRoot, hit, charm, charmSize, three, attachOptions)
    ));
  }

  function computeCraftAttachmentLayout(bounds, three, options = {}) {
    const center = bounds.getCenter(new three.Vector3());
    const size = bounds.getSize(new three.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    const isKnifeModel = Boolean(options.isKnifeModel);
    const camera = options.camera || null;
    const weaponName = resolveWeaponNameFromTitle(options.itemTitle);
    const stickerRays = [];

    for (let i = 0; i < 5; i += 1) {
      const origin = resolveStickerSlotAnchor(weaponName, i, center, size, three, options);
      const direction = new three.Vector3();
      if (camera) {
        const camDir = new three.Vector3().subVectors(camera.position, origin);
        if (camDir.lengthSq() > 1e-8) {
          camDir.normalize();
          direction.copy(camDir).negate();
        } else {
          direction.set(0, -0.12, -1).normalize();
        }
      } else {
        direction.set(0, -0.12, -1).normalize();
      }
      stickerRays.push({ origin, direction });
    }

    const charmOrigin = new three.Vector3(
      center.x - size.x * (isKnifeModel ? 0.1 : 0.14),
      center.y + size.y * (isKnifeModel ? 0.02 : -0.02),
      center.z + size.z * 0.38
    );
    const charmDirection = new three.Vector3(0, -0.05, -1);
    if (camera) {
      const camDir = new three.Vector3().subVectors(camera.position, center);
      if (camDir.lengthSq() > 1e-8) {
        camDir.normalize();
        charmOrigin.addScaledVector(camDir, Math.max(size.z * 0.28, maxDimension * 0.08));
        charmDirection.copy(camDir).negate();
      } else {
        charmDirection.normalize();
      }
    } else {
      charmDirection.normalize();
    }

    const baseStickerSize = computeBaseStickerSize(size, maxDimension, options);

    return {
      stickerRays,
      charmRay: { origin: charmOrigin, direction: charmDirection },
      baseStickerSize,
      stickerSize: baseStickerSize,
      charmSize: computeCraftCharmSize(size),
    };
  }

  function syncCraftAttachments(modelRoot, attachments, three, options = {}) {
    disposeCraftAttachments(modelRoot);
    if (!modelRoot || !three) return Promise.resolve();

    const stickers = Array.isArray(attachments?.stickers) ? attachments.stickers : [];
    const charm = attachments?.charm || null;
    const stickerSlab = attachments?.stickerSlab || null;
    const hasStickers = stickers.some((entry) => entry?.image);
    if (!hasStickers && !charm?.image && !stickerSlab?.image) return Promise.resolve();

    const generation = (modelRoot.userData.craftSyncGeneration || 0) + 1;
    modelRoot.userData.craftSyncGeneration = generation;

    modelRoot.updateMatrixWorld(true);
    const bounds = computeViewerBounds(modelRoot, three, options);
    const stickerMeshes = collectMeshesForCraftKind(modelRoot, "sticker");
    const charmMeshes = collectMeshesForCraftKind(modelRoot, "charm");
    if (!stickerMeshes.length && !charmMeshes.length) return Promise.resolve();
    prepareCraftRaycastMeshes(stickerMeshes);
    prepareCraftRaycastMeshes(charmMeshes);

    const layout = computeCraftAttachmentLayout(bounds, three, options);
    modelRoot.userData.craftCharmSize = layout.charmSize;
    const weaponName = resolveWeaponNameFromTitle(options.itemTitle);
    const attachOptions = { ...options, syncGeneration: generation, modelRoot };
    const jobs = [];

    stickers.forEach((entry, index) => {
      if (!entry?.image || !stickerMeshes.length) return;
      const hit = findStickerHit(stickerMeshes, bounds, index, layout, three, options, entry);
      if (!hit) return;
      const stickerSize = resolveStickerSizeForSlot(layout.baseStickerSize, weaponName, index, options);
      jobs.push(attachStickerDecal(modelRoot, hit, entry, stickerSize, three, index, attachOptions));
    });

    if (charm?.image && charmMeshes.length) {
      const hit = findCharmHit(charmMeshes, bounds, layout, three, options, charm);
      if (hit) {
        const charmIsSlab = isStickerSlabEntry(charm, attachOptions);
        jobs.push(attachCharmModel(modelRoot, hit, charm, layout.charmSize * (charmIsSlab ? 1.4 : 1), three, {
          ...attachOptions,
          isSlab: charmIsSlab,
        }));
      }
    }

    if (stickerSlab?.image && charmMeshes.length) {
      const hit = findCharmHit(charmMeshes, bounds, layout, three, options, stickerSlab);
      if (hit) {
        jobs.push(attachCharmModel(modelRoot, hit, stickerSlab, layout.charmSize * 1.4, three, {
          ...attachOptions,
          isSlab: true,
        }));
      }
    }

    if (!jobs.length) return Promise.resolve();

    return Promise.all(jobs).then((results) => {
      if (modelRoot.userData.craftSyncGeneration !== generation) return;
      modelRoot.userData.craftCharmPhysics = results.filter(
        (result) => result && typeof result.update === "function"
      );
    });
  }

  function mountSkinViewer(container, options = {}) {
    const {
      itemTitle = "",
      skinModelUrl = "",
      baseModelUrl = "",
      skinModelMeta = null,
      texturePack = null,
      wearFloat = 0.25,
      visualType = "skins",
      stickers = [],
      charm = null,
      stickerSlab = null,
      onStatus = () => {},
      onStickerPlacement = null,
      onCharmPlacement = null,
      onStickerSlabPlacement = null,
    } = options;

    const resolvedBaseUrl = String(baseModelUrl || resolveLocalModelUrl(itemTitle) || "").trim();
    const preferredSkinUrl = resolvePreferredSkinModelUrl(itemTitle, skinModelUrl);
    const preferBakedModel = Boolean(preferredSkinUrl && preferredSkinUrl !== resolvedBaseUrl);
    const forceRuntimeTextures = Boolean(options.forceRuntimeTextures && texturePack?.albedo && resolvedBaseUrl);
    const hasRuntimeTextures = Boolean(
      forceRuntimeTextures
      || (!preferBakedModel && texturePack?.albedo && resolvedBaseUrl)
    );
    const localModelUrl = hasRuntimeTextures
      ? resolvedBaseUrl
      : (preferredSkinUrl || resolvedBaseUrl);
    const isAgentModel = visualType === "agents";
    const isKnifeModel = visualType === "knives" || /\/knife\//i.test(localModelUrl);
    const canFallbackToBaseModel = Boolean(
      resolvedBaseUrl
      && preferredSkinUrl
      && preferredSkinUrl !== resolvedBaseUrl
      && !hasRuntimeTextures
    );
    const preferredAnimationName = String(skinModelMeta?.default_animation || "");
    const configuredPreviewTime = Number(skinModelMeta?.preview_time);
    const finishToken = String(skinModelMeta?.finish_token || "");
    const isHydroSkin = finishToken.startsWith("hy_");

    if (!container || !localModelUrl) {
      onStatus("error");
      return () => {};
    }
    if (!window.THREE || !window.THREE.GLTFLoader || !window.THREE.OrbitControls) {
      onStatus("error");
      return () => {};
    }

    let cancelled = false;
    let resources = null;

    const stopRenderLoop = (activeResources) => {
      if (!activeResources) return;
      activeResources.isActive = false;
      if (activeResources.frameId) {
        window.cancelAnimationFrame(activeResources.frameId);
        activeResources.frameId = null;
      }
    };

    const destroyViewerResources = (activeResources, disposeModel) => {
      if (!activeResources) return;
      stopRenderLoop(activeResources);
      if (activeResources.craftSyncTimer) {
        window.clearTimeout(activeResources.craftSyncTimer);
        activeResources.craftSyncTimer = null;
      }
      activeResources.resizeObserver?.disconnect();
      if (activeResources.resizeHandler) window.removeEventListener("resize", activeResources.resizeHandler);
      if (disposeModel && activeResources.modelRoot) {
        activeResources.animationAction?.stop?.();
        activeResources.mixer?.stopAllAction?.();
        activeResources.modelRoot.traverse((child) => {
          if (child.geometry?.dispose) child.geometry.dispose();
          if (child.material) disposeViewerMaterials(child.material);
        });
      }
      if (activeResources.controls) {
        if (activeResources.controlStartHandler) activeResources.controls.removeEventListener("start", activeResources.controlStartHandler);
        if (activeResources.controlEndHandler) activeResources.controls.removeEventListener("end", activeResources.controlEndHandler);
        activeResources.controls.dispose?.();
      }
      if (activeResources.stickerPointerDownHandler) {
        activeResources.renderer?.domElement?.removeEventListener("pointerdown", activeResources.stickerPointerDownHandler);
        activeResources.renderer?.domElement?.removeEventListener("pointermove", activeResources.stickerPointerMoveHandler);
        activeResources.renderer?.domElement?.removeEventListener("pointerup", activeResources.stickerPointerUpHandler);
      }
      activeResources.renderer?.dispose?.();
      const host = activeResources.renderer?.domElement?.parentNode;
      if (host) host.removeChild(activeResources.renderer.domElement);
    };

    onStatus("loading");

    const scene = new window.THREE.Scene();
    const camera = new window.THREE.PerspectiveCamera(VIEWER_CAMERA_FOV, 1, 0.1, 100);
    const renderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = window.THREE.sRGBEncoding;
    renderer.toneMapping = window.THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    container.appendChild(renderer.domElement);

    const ambientLight = new window.THREE.AmbientLight(0xffffff, 0.36);
    const keyLight = new window.THREE.DirectionalLight(0xffffff, 0.7);
    const fillLight = new window.THREE.DirectionalLight(0xe8eefc, 0.28);
    const rimLight = new window.THREE.DirectionalLight(0xffffff, 0.14);
    const hemiLight = new window.THREE.HemisphereLight(0xf4f7ff, 0x141824, 0.1);
    keyLight.position.set(4.8, 5.4, 6.2);
    fillLight.position.set(-5.8, 2.4, 4.2);
    rimLight.position.set(-2.4, 3.8, -6.8);
    scene.add(ambientLight, keyLight, fillLight, rimLight, hemiLight);

    const controls = new window.THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.zoomSpeed = 1.12;
    controls.minPolarAngle = isAgentModel ? Math.PI * 0.18 : (isKnifeModel ? Math.PI * 0.24 : Math.PI * 0.3);
    controls.maxPolarAngle = isAgentModel ? Math.PI * 0.82 : (isKnifeModel ? Math.PI * 0.76 : Math.PI * 0.7);

    resources = {
      animationAction: null,
      camera,
      controlEndHandler: null,
      controlStartHandler: null,
      controls,
      floatAmplitude: 0,
      floatBasePosition: null,
      floatElapsed: 0,
      floatEnabled: !isAgentModel,
      floatPaused: false,
      orbitDragging: false,
      userOrbited: false,
      cameraFrame: null,
      floatPhase: Math.random() * Math.PI * 2,
      frameId: null,
      isActive: false,
      lastFrameTime: 0,
      mixer: null,
      modelRoot: null,
      orbitFocus: null,
      renderer,
      resizeHandler: null,
      resizeObserver: null,
      scene,
      hasRoughnessMap: false,
      hasWearMap: false,
      updateWearFloat: () => {},
      craftAttachments: {
        stickers: Array.isArray(stickers) ? stickers : [],
        charm: charm || null,
        stickerSlab: stickerSlab || null,
      },
      stickerPlacementSlot: null,
      charmPlacementMode: false,
      stickerSlabPlacementMode: false,
      pointerDownX: 0,
      pointerDownY: 0,
      pointerDragged: false,
      stickerPointerDownHandler: null,
      stickerPointerUpHandler: null,
      craftSyncTimer: null,
      craftSyncToken: 0,
      craftPreviewFrame: null,
      craftPreviewToken: 0,
    };

    resources.controlStartHandler = () => {
      resources.orbitDragging = true;
      resources.userOrbited = true;
    };
    resources.controlEndHandler = () => { resources.orbitDragging = false; };
    controls.addEventListener("start", resources.controlStartHandler);
    controls.addEventListener("end", resources.controlEndHandler);

    resources.stickerPointerDownHandler = (event) => {
      resources.pointerDownX = event.clientX;
      resources.pointerDownY = event.clientY;
      resources.pointerDragged = false;
    };
    resources.stickerPointerMoveHandler = (event) => {
      const dx = event.clientX - resources.pointerDownX;
      const dy = event.clientY - resources.pointerDownY;
      if ((dx * dx + dy * dy) > 36) {
        resources.pointerDragged = true;
      }
    };
    resources.stickerPointerUpHandler = (event) => {
      if (resources.pointerDragged || !resources.modelRoot) {
        return;
      }
      const wantsSticker = resources.stickerPlacementSlot != null;
      const wantsCharm = Boolean(resources.charmPlacementMode);
      const wantsSlab = Boolean(resources.stickerSlabPlacementMode);
      if (!wantsSticker && !wantsCharm && !wantsSlab) {
        return;
      }
      const raycastOptions = {
        isKnifeModel,
        isAgentModel,
        camera: resources.camera || null,
        itemTitle,
        renderer: resources.renderer || null,
      };
      const placement = wantsSticker
        ? raycastCraftSurfaceFromClient(
          resources.renderer,
          resources.camera,
          resources.modelRoot,
          event.clientX,
          event.clientY,
          window.THREE
        )
        : resolveCraftSurfacePlacement(
          resources.modelRoot,
          window.THREE,
          raycastOptions,
          wantsSlab ? "slab" : "charm",
          null,
          event.clientX,
          event.clientY
        );
      if (!placement) return;
      if (wantsSticker) {
        onStickerPlacement?.({
          slotIndex: resources.stickerPlacementSlot,
          placement,
        });
        return;
      }
      if (wantsSlab) {
        onStickerSlabPlacement?.({ placement });
        return;
      }
      onCharmPlacement?.({ placement });
    };
    renderer.domElement.addEventListener("pointerdown", resources.stickerPointerDownHandler);
    renderer.domElement.addEventListener("pointermove", resources.stickerPointerMoveHandler);
    renderer.domElement.addEventListener("pointerup", resources.stickerPointerUpHandler);

    const applyGunCameraFraming = () => {
      const frame = resources.cameraFrame;
      if (!frame || !window.THREE) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      const viewerAspect = Math.max(width / Math.max(height, 1), 1);
      const cameraPlacement = frame.useStandardGunCamera
        ? resolveStandardGunCameraPlacement(frame.framedCenter, frame.framedSize, window.THREE, {
          viewerAspect,
          cameraFov: camera.fov,
          viewerHeight: height,
          viewerWidth: width,
          presentationHeadroomPx: options.presentationHeadroomPx,
          presentationPanPx: options.presentationPanPx,
        })
        : resolveViewerCameraPlacement(frame.framedCenter, frame.framedSize, window.THREE, {
          isAgentModel: frame.isAgentModel,
          isKnifeModel: frame.isKnifeModel,
          viewerAspect,
          cameraFov: camera.fov,
        });
      const maxDimension = cameraPlacement.maxDimension || 1;
      camera.near = Math.max(0.001, maxDimension * (frame.isAgentModel ? 0.015 : 0.03));
      camera.far = Math.max(30, maxDimension * (frame.isAgentModel ? 24 : 16));
      camera.position.copy(cameraPlacement.position);
      camera.lookAt(cameraPlacement.focus);
      camera.updateProjectionMatrix();
      controls.target.copy(cameraPlacement.focus);
      controls.minDistance = Math.max(
        cameraPlacement.cameraDistance * (frame.isAgentModel ? 0.58 : 0.72),
        maxDimension * (frame.isAgentModel ? 0.54 : 0.62)
      );
      controls.maxDistance = Math.max(
        cameraPlacement.cameraDistance * (frame.isAgentModel ? 2.2 : 1.9),
        maxDimension * (frame.isAgentModel ? 3.2 : 2.7)
      );
      controls.update();
      resources.orbitFocus = {
        x: cameraPlacement.focus.x,
        y: cameraPlacement.focus.y,
        z: cameraPlacement.focus.z,
      };
    };

    const resizeViewer = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (!resources.userOrbited) applyGunCameraFraming();
    };
    resources.resizeHandler = resizeViewer;
    window.addEventListener("resize", resizeViewer);
    if (typeof window.ResizeObserver === "function") {
      resources.resizeObserver = new window.ResizeObserver(resizeViewer);
      resources.resizeObserver.observe(container);
    }

    const startRenderLoop = () => {
      resources.isActive = true;
      resources.lastFrameTime = window.performance.now();
      const renderFrame = () => {
        if (!resources?.isActive) return;
        const now = window.performance.now();
        const delta = Math.min(0.05, Math.max(0, (now - resources.lastFrameTime) / 1000));
        resources.lastFrameTime = now;
        const pauseFloat = Boolean(
          resources.orbitDragging
          || resources.craftPlacementMode
          || resources.charmPlacementMode
          || resources.stickerSlabPlacementMode
          || resources.stickerPlacementSlot != null
        );
        resources.floatPaused = pauseFloat;
        if (resources.floatEnabled && resources.modelRoot && resources.floatBasePosition && !pauseFloat) {
          resources.floatElapsed += delta;
          const bob = Math.sin(resources.floatElapsed * 1.65 + resources.floatPhase) * resources.floatAmplitude;
          resources.modelRoot.position.y = resources.floatBasePosition.y + bob;
          if (resources.orbitFocus) {
            resources.controls.target.set(resources.orbitFocus.x, resources.orbitFocus.y + bob, resources.orbitFocus.z);
          }
        } else if (pauseFloat && resources.modelRoot && resources.floatBasePosition) {
          resources.modelRoot.position.y = resources.floatBasePosition.y;
          if (resources.orbitFocus) {
            resources.controls.target.set(resources.orbitFocus.x, resources.orbitFocus.y, resources.orbitFocus.z);
          }
        }
        if (resources.mixer) resources.mixer.update(delta);
        resources.controls.update();

        // Keep charm facing fixed in world space (see its back when you orbit around).
        try {
          syncCharmAnchorsFaceCamera(resources, window.THREE);
        } catch (_error) {
          // Non-fatal — charm sway/physics still run.
        }

        // Orbit moves the camera, not the weapon — convert view spin into charm sway.
        const charmPhysics = resources.modelRoot?.userData?.craftCharmPhysics;
        const previewPhysics = resources.modelRoot?.userData?.craftCharmPreviewPhysics;
        const hasCharmPhysics = (Array.isArray(charmPhysics) && charmPhysics.length)
          || (previewPhysics && typeof previewPhysics.update === "function");
        if (hasCharmPhysics && typeof resources.controls?.getAzimuthalAngle === "function") {
          const az = resources.controls.getAzimuthalAngle();
          const pol = resources.controls.getPolarAngle();
          if (!resources.orbitCharmAngles) {
            resources.orbitCharmAngles = { az, pol };
          } else {
            let dAz = az - resources.orbitCharmAngles.az;
            if (dAz > Math.PI) dAz -= Math.PI * 2;
            if (dAz < -Math.PI) dAz += Math.PI * 2;
            const dPol = pol - resources.orbitCharmAngles.pol;
            resources.orbitCharmAngles.az = az;
            resources.orbitCharmAngles.pol = pol;
            const dragBoost = resources.floatPaused ? 1.55 : 1;
            const impulseX = Math.max(-5, Math.min(5, (-dPol * 28 + dAz * 5) * dragBoost));
            const impulseZ = Math.max(-5, Math.min(5, (dAz * 32 + dPol * 4) * dragBoost));
            if (Math.abs(impulseX) > 1e-4 || Math.abs(impulseZ) > 1e-4) {
              if (Array.isArray(charmPhysics)) {
                for (let i = 0; i < charmPhysics.length; i += 1) {
                  charmPhysics[i]?.addImpulse?.(impulseX, impulseZ);
                }
              }
              previewPhysics?.addImpulse?.(impulseX, impulseZ);
            }
          }
        }

        if (Array.isArray(charmPhysics) && charmPhysics.length) {
          for (let i = 0; i < charmPhysics.length; i += 1) {
            try {
              charmPhysics[i]?.update?.(delta);
            } catch (_error) {
              // Keep the viewer alive if a charm sim fails (old Three APIs / disposed nodes).
            }
          }
        }
        try {
          previewPhysics?.update?.(delta);
        } catch (_error) {
          if (resources.modelRoot?.userData) {
            resources.modelRoot.userData.craftCharmPreviewPhysics = null;
          }
        }
        resources.renderer.render(resources.scene, resources.camera);
        resources.frameId = window.requestAnimationFrame(renderFrame);
      };
      if (resources.frameId) window.cancelAnimationFrame(resources.frameId);
      renderFrame();
    };

    const originalCreateImageBitmap = window.createImageBitmap;
    const shouldRestoreImageBitmap = /\.glb$/i.test(localModelUrl) && typeof originalCreateImageBitmap === "function";
    const restoreImageBitmap = () => {
      if (!shouldRestoreImageBitmap) return;
      try { window.createImageBitmap = originalCreateImageBitmap; } catch (_error) { /* noop */ }
    };
    if (shouldRestoreImageBitmap) {
      try { window.createImageBitmap = undefined; } catch (_error) { restoreImageBitmap(); }
    }

    const loader = new window.THREE.GLTFLoader();

    const finalizeLoadedModel = (gltf) => {
      restoreImageBitmap();
      if (cancelled) {
        destroyViewerResources(resources, true);
        return;
      }
      const modelRoot = gltf.scene;
      resources.modelRoot = modelRoot;

      let hasLegacyBody = false;
      let hasHdBody = false;
      modelRoot.traverse((child) => {
        const meshName = String(child?.name || "").toLowerCase();
        if (meshName.includes("body_legacy")) hasLegacyBody = true;
        if (meshName.includes("body_hd")) hasHdBody = true;
      });

      const showLegacyBody = hasLegacyBody && (
        preferBakedModel
        || (hasRuntimeTextures && /^(aq_|am_|gs_ak47_bloodsport)/i.test(finishToken))
        || (!hasRuntimeTextures && hasLegacyBody && !hasHdBody)
      );

      if (preferBakedModel && /assets\/models\/crafter\//i.test(String(preferredSkinUrl || ""))) {
        hideCrafterPreviewMeshes(modelRoot);
      }

      modelRoot.traverse((child) => {
        const meshName = String(child?.name || "").toLowerCase();
        if (hasLegacyBody && hasHdBody) {
          if (showLegacyBody && meshName.includes("body_hd")) {
            child.visible = false;
          } else if (!showLegacyBody && meshName.includes("body_legacy") && hasRuntimeTextures) {
            child.visible = false;
          }
        }
        if (isAgentModel && meshName && /(firstperson|defusekit)/i.test(meshName)) child.visible = false;
        if (child?.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          if (preferBakedModel && mats.some((mat) => /sticker_gaps/i.test(String(mat?.name || "")))) {
            child.visible = false;
          }
          const glockLegacyPaint = isGlockLegacyPaintMesh(child);
          enhanceViewerMaterials(child.material, window.THREE, {
            isHydroSkin,
            preferBakedModel,
            glockLegacyPaint,
          });
          if (glockLegacyPaint) prepareGlockLegacyPaintMesh(child, window.THREE);
        }
      });

      hideShotgunShellMeshes(modelRoot, window.THREE, {
        itemTitle,
        modelUrl: localModelUrl,
        source: "skin-crafter",
      });

      const finishSceneSetup = () => {
        if (cancelled) return;
        modelRoot.rotation.set(0, 0, 0);
        modelRoot.updateMatrixWorld(true);
        normalizeViewerModelScale(modelRoot, window.THREE, { isAgentModel });

        // The preview clip is prepared here but deliberately NOT evaluated yet —
        // see settlePreviewPose() below.
        const previewClip = pickPreviewAnimation(gltf.animations, preferredAnimationName);
        let settlePreviewPose = () => {};
        if (previewClip) {
          const mixer = new window.THREE.AnimationMixer(modelRoot);
          const action = mixer.clipAction(previewClip);
          action.enabled = true;
          action.reset();
          action.setLoop(window.THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.play();
          const previewTime = resolvePreviewPoseTime(previewClip, configuredPreviewTime);
          settlePreviewPose = () => {
            // Always settle, even at t=0: the clips here have zero duration, so
            // the old `previewTime > 0` guard skipped this entirely and left the
            // render loop to pose the model on its first frame — i.e. after it
            // had been centred and the camera fitted. That is what pushed
            // weapons off-centre and clipped them against the edge.
            mixer.update(previewTime);
            action.paused = true;
            modelRoot.updateMatrixWorld(true);
          };
          resources.mixer = mixer;
          resources.animationAction = action;
        }

        // Orientation is decided on the BIND pose. Posing first would change the
        // proportions normalizeGunPresentation measures and flip weapons that
        // currently come out right, so the pose lands between orientation and
        // framing: the heuristic reads the bind pose, the camera frames what is
        // actually drawn.
        if (!isAgentModel && !isKnifeModel) {
          normalizeGunPresentation(modelRoot, window.THREE, {
            itemTitle,
            modelUrl: localModelUrl || preferredSkinUrl,
          });
          applyWeaponInspectPose(modelRoot, window.THREE, {
            itemTitle,
            modelUrl: localModelUrl || preferredSkinUrl,
          });
        }

        settlePreviewPose();
        modelRoot.updateMatrixWorld(true);
        if (!isAgentModel) {
          bakeSkinnedWeaponMeshes(modelRoot, window.THREE);
        }
        if (!isAgentModel && !isKnifeModel) {
          centerGunModelInView(modelRoot, window.THREE, { isAgentModel });
        } else {
          const initialBounds = computeViewerBounds(modelRoot, window.THREE, { isAgentModel });
          const rotatedCenter = initialBounds.getCenter(new window.THREE.Vector3());
          modelRoot.position.sub(rotatedCenter);
          modelRoot.updateMatrixWorld(true);
        }

        const bounds = computeViewerBounds(modelRoot, window.THREE, { isAgentModel });
        const framedBounds = bounds;
        const framedCenter = framedBounds.getCenter(new window.THREE.Vector3());
        const framedSize = framedBounds.getSize(new window.THREE.Vector3());
        // Keep camera focus on the recentered gun (avoid leftover AABB drift).
        if (!isAgentModel && !isKnifeModel) {
          framedCenter.set(
            Math.abs(framedCenter.x) < framedSize.x * 0.02 ? 0 : framedCenter.x,
            Math.abs(framedCenter.y) < framedSize.y * 0.02 ? 0 : framedCenter.y,
            Math.abs(framedCenter.z) < framedSize.z * 0.02 ? 0 : framedCenter.z
          );
        }
        const viewerAspect = Math.max(container.clientWidth / Math.max(container.clientHeight, 1), 1);
        const useStandardGunCamera = !isAgentModel && !isKnifeModel;
        const cameraPlacement = useStandardGunCamera
          ? resolveStandardGunCameraPlacement(framedCenter, framedSize, window.THREE, {
            viewerAspect,
            cameraFov: camera.fov,
            viewerHeight: container.clientHeight,
            viewerWidth: container.clientWidth,
            presentationHeadroomPx: options.presentationHeadroomPx,
            presentationPanPx: options.presentationPanPx,
          })
          : resolveViewerCameraPlacement(framedCenter, framedSize, window.THREE, {
            isAgentModel,
            isKnifeModel,
            viewerAspect,
            cameraFov: camera.fov,
          });
        const focusX = cameraPlacement.focus.x;
        const focusY = cameraPlacement.focus.y;
        const focusZ = cameraPlacement.focus.z;
        const maxDimension = cameraPlacement.maxDimension || 1;

        scene.add(modelRoot);
        camera.near = Math.max(0.001, maxDimension * (isAgentModel ? 0.015 : 0.03));
        camera.far = Math.max(30, maxDimension * (isAgentModel ? 24 : 16));
        camera.position.copy(cameraPlacement.position);
        camera.lookAt(cameraPlacement.focus);
        camera.updateProjectionMatrix();
        controls.target.copy(cameraPlacement.focus);
        controls.minDistance = Math.max(
          cameraPlacement.cameraDistance * (isAgentModel ? 0.58 : 0.72),
          maxDimension * (isAgentModel ? 0.54 : 0.62)
        );
        controls.maxDistance = Math.max(
          cameraPlacement.cameraDistance * (isAgentModel ? 2.2 : 1.9),
          maxDimension * (isAgentModel ? 3.2 : 2.7)
        );
        controls.update();

        resources.floatAmplitude = isKnifeModel
          ? Math.max(maxDimension * 0.028, 0.008)
          : Math.max(maxDimension * 0.016, 0.004);
        resources.floatBasePosition = modelRoot.position.clone();
        resources.orbitFocus = { x: focusX, y: focusY, z: focusZ };
        resources.floatElapsed = 0;
        resources.userOrbited = false;
        resources.cameraFrame = {
          framedCenter: framedCenter.clone(),
          framedSize: framedSize.clone(),
          useStandardGunCamera,
          isAgentModel,
          isKnifeModel,
        };

        if (!isAgentModel && !isKnifeModel) {
          attachViewerHands(modelRoot, window.THREE);
        }

        resizeViewer();
        syncCraftAttachments(
          modelRoot,
          resources.craftAttachments || { stickers, charm, stickerSlab },
          window.THREE,
          {
            isKnifeModel,
            isAgentModel,
            camera,
            renderer,
            itemTitle,
          }
        )
          .finally(() => {
            if (!cancelled) {
              onStatus("ready");
              startRenderLoop();
            }
          });
      };

      const texturePromise = hasRuntimeTextures
        ? applyRuntimeSkinTextures(modelRoot, texturePack, window.THREE, { wearFloat })
        : Promise.resolve({ applied: false, hasRoughnessMap: false, hasWearMap: false });

      texturePromise.then((textureMeta) => {
        if (cancelled || !textureMeta) return;
        resources.hasRoughnessMap = Boolean(textureMeta.hasRoughnessMap);
        resources.hasWearMap = Boolean(textureMeta.hasWearMap);
        resources.updateWearFloat = (nextFloat) => {
          applyWearFloatToModel(resources.modelRoot, nextFloat, window.THREE, {
            hasRoughnessMap: resources.hasRoughnessMap,
            hasWearMap: resources.hasWearMap,
            preferBakedModel,
          });
        };
      }).finally(() => {
        if (!cancelled) {
          resources.updateWearFloat = resources.updateWearFloat || ((nextFloat) => {
            applyWearFloatToModel(resources.modelRoot, nextFloat, window.THREE, {
              hasRoughnessMap: resources.hasRoughnessMap,
              hasWearMap: resources.hasWearMap,
              preferBakedModel,
            });
          });
          finishSceneSetup();
        }
      });
    };

    const loadViewerModel = (modelUrl, allowFallback) => {
      loader.load(
        modelUrl,
        finalizeLoadedModel,
        undefined,
        () => {
          if (!cancelled && allowFallback && resolvedBaseUrl && modelUrl !== resolvedBaseUrl) {
            loadViewerModel(resolvedBaseUrl, false);
            return;
          }
          restoreImageBitmap();
          destroyViewerResources(resources, true);
          if (!cancelled) onStatus("error");
        }
      );
    };

    const initialModelUrl = hasRuntimeTextures
      ? resolvedBaseUrl
      : (preferredSkinUrl || resolvedBaseUrl);
    loadViewerModel(initialModelUrl, canFallbackToBaseModel);

    const dispose = () => {
      cancelled = true;
      restoreImageBitmap();
      destroyViewerResources(resources, true);
      resources = null;
    };

    dispose.updateWearFloat = (nextFloat) => {
      resources?.updateWearFloat?.(nextFloat);
    };

    dispose.updateCraftAttachments = (nextStickers, nextCharm, nextStickerSlab) => {
      if (!resources) return;
      resources.craftAttachments = {
        stickers: Array.isArray(nextStickers) ? nextStickers : [],
        charm: nextCharm || null,
        stickerSlab: nextStickerSlab || null,
      };
      if (!resources.modelRoot) return;
      resources.craftSyncToken += 1;
      const token = resources.craftSyncToken;
      if (resources.craftSyncTimer) {
        window.clearTimeout(resources.craftSyncTimer);
        resources.craftSyncTimer = null;
      }
      if (resources.craftSyncFrame) {
        window.cancelAnimationFrame(resources.craftSyncFrame);
        resources.craftSyncFrame = null;
      }

      const runSync = () => {
        if (!resources?.modelRoot || token !== resources.craftSyncToken) return;
        syncCraftAttachments(
          resources.modelRoot,
          resources.craftAttachments,
          window.THREE,
          {
            isKnifeModel,
            isAgentModel,
            camera: resources.camera || null,
            renderer: resources.renderer || null,
            itemTitle,
            modelRoot: resources.modelRoot,
          }
        ).catch(() => undefined);
      };

      // Coalesce sticker + charm/slab updates into one sync so they always attach together.
      resources.craftSyncFrame = window.requestAnimationFrame(() => {
        resources.craftSyncFrame = null;
        runSync();
      });
    };

    dispose.setStickerPlacementMode = (slotIndex) => {
      if (!resources) return;
      resources.stickerPlacementSlot = Number.isInteger(slotIndex) ? slotIndex : null;
    };

    dispose.setCharmPlacementMode = (enabled) => {
      if (!resources) return;
      resources.charmPlacementMode = Boolean(enabled);
    };

    dispose.setStickerSlabPlacementMode = (enabled) => {
      if (!resources) return;
      resources.stickerSlabPlacementMode = Boolean(enabled);
    };

    dispose.setCraftPlacementMode = (active) => {
      if (!resources) return;
      resources.craftPlacementMode = Boolean(active);
      setOrbitPlacementMode(resources.controls, Boolean(active), window.THREE);
    };

    dispose.updateCraftPreview = (preview) => {
      if (!resources?.modelRoot) return Promise.resolve();
      resources.craftPreview = preview || null;
      if (!preview) {
        if (resources.craftPreviewFrame) {
          window.cancelAnimationFrame(resources.craftPreviewFrame);
          resources.craftPreviewFrame = null;
        }
        resources.craftPreviewToken += 1;
        disposeCraftPreview(resources.modelRoot);
        return Promise.resolve();
      }

      resources.craftPreviewToken += 1;
      const token = resources.craftPreviewToken;
      if (resources.craftPreviewFrame) {
        window.cancelAnimationFrame(resources.craftPreviewFrame);
      }

      return new Promise((resolve) => {
        resources.craftPreviewFrame = window.requestAnimationFrame(() => {
          resources.craftPreviewFrame = null;
          if (!resources?.modelRoot || token !== resources.craftPreviewToken) {
            resolve();
            return;
          }
          syncCraftPreview(
            resources.modelRoot,
            preview,
            window.THREE,
            {
              isKnifeModel,
              isAgentModel,
              camera: resources.camera || null,
              itemTitle,
              renderer: resources.renderer || null,
              modelRoot: resources.modelRoot,
            }
          ).then(resolve).catch(() => resolve());
        });
      });
    };

    dispose.clearCraftPreview = () => {
      if (!resources?.modelRoot) return;
      resources.craftPreview = null;
      resources.craftPreviewToken += 1;
      if (resources.craftPreviewFrame) {
        window.cancelAnimationFrame(resources.craftPreviewFrame);
        resources.craftPreviewFrame = null;
      }
      disposeCraftPreview(resources.modelRoot);
    };

    dispose.resolvePresetPlacement = (kind, presetIndex, entry) => {
      if (!resources?.modelRoot) return null;
      const normalizedKind = kind === "slab" ? "charm" : kind;
      return resolveCraftPresetPlacement(
        resources.modelRoot,
        window.THREE,
        {
          isKnifeModel,
          isAgentModel,
          camera: resources.camera || null,
          itemTitle,
          renderer: resources.renderer || null,
        },
        normalizedKind,
        presetIndex,
        entry || null
      );
    };

    dispose.computeInspectCharmPlacement = (entry) => {
      if (!resources?.modelRoot || !window.THREE) return null;
      const placement = entry?.placement;
      const charmMeshes = collectMeshesForCraftKind(resources.modelRoot, "charm");
      const meshes = charmMeshes.length ? charmMeshes : collectCraftRaycastMeshes(resources.modelRoot);
      if (!meshes.length) return placement?.inspect || null;
      prepareCraftRaycastMeshes(meshes);
      const viewerOptions = {
        isKnifeModel,
        isAgentModel,
        camera: resources.camera || null,
        itemTitle,
        renderer: resources.renderer || null,
        meshes,
        modelRoot: resources.modelRoot,
      };
      const hit = placement
        ? resolvePlacementHit(placement, meshes, window.THREE, resources.modelRoot)
        : null;
      if (!hit) return placement?.inspect || null;
      return computeInspectCharmOffsets(
        resources.modelRoot,
        hit,
        window.THREE,
        resources.camera || null,
        viewerOptions
      );
    };

    dispose.computeInspectStickerPlacement = (slotIndex, entry) => {
      if (!resources?.modelRoot) return null;
      const placement = entry?.placement;
      const stickerMeshes = collectStickerRaycastMeshes(resources.modelRoot);
      const meshes = stickerMeshes.length ? stickerMeshes : collectCraftRaycastMeshes(resources.modelRoot);
      if (!meshes.length) return placement?.inspect || null;
      prepareCraftRaycastMeshes(meshes);
      const viewerOptions = {
        isKnifeModel,
        isAgentModel,
        camera: resources.camera || null,
        itemTitle,
        renderer: resources.renderer || null,
        meshes,
        entry: entry || null,
        rotationDegrees: stickerRotationFromEntry(entry),
      };
      const bounds = computeViewerBounds(resources.modelRoot, window.THREE, viewerOptions);
      const layout = computeCraftAttachmentLayout(bounds, window.THREE, viewerOptions);
      const hit = placement
        ? resolvePlacementHit(placement, meshes, window.THREE, resources.modelRoot)
        : findStickerHit(
          meshes,
          bounds,
          Number.isInteger(slotIndex) ? slotIndex : 0,
          layout,
          window.THREE,
          { ...viewerOptions, modelRoot: resources.modelRoot },
          entry || null
        );
      if (!hit) return placement?.inspect || null;
      return computeInspectPlacementOffsets(
        resources.modelRoot,
        hit,
        window.THREE,
        resources.camera || null,
        Number.isInteger(slotIndex) ? slotIndex : null,
        viewerOptions
      );
    };

    dispose.resolveNearestEmptyStickerSlot = (pointOrPlacement, occupiedSlots = []) => {
      if (!resources?.modelRoot || !window.THREE) return -1;
      let worldPoint = null;
      if (pointOrPlacement && typeof pointOrPlacement === "object" && Array.isArray(pointOrPlacement.point)) {
        worldPoint = placementPointWorld(pointOrPlacement, resources.modelRoot, window.THREE);
      } else if (Array.isArray(pointOrPlacement)) {
        worldPoint = placementPointWorld(
          { point: pointOrPlacement, space: "world" },
          resources.modelRoot,
          window.THREE
        );
      } else if (pointOrPlacement && typeof pointOrPlacement.distanceToSquared === "function") {
        worldPoint = pointOrPlacement;
      }
      if (!worldPoint) return -1;
      return resolveNearestEmptyStickerSlot(
        resources.modelRoot,
        worldPoint,
        occupiedSlots,
        window.THREE,
        {
          isKnifeModel,
          isAgentModel,
          camera: resources.camera || null,
          itemTitle,
        }
      );
    };

    dispose.raycastCraftPlacement = (clientX, clientY, kind, entry) => {
      if (!resources?.modelRoot) return null;
      const normalizedKind = kind === "slab" ? "charm" : kind;
      return resolveCraftSurfacePlacement(
        resources.modelRoot,
        window.THREE,
        {
          isKnifeModel,
          isAgentModel,
          camera: resources.camera || null,
          itemTitle,
          renderer: resources.renderer || null,
        },
        normalizedKind,
        entry || null,
        clientX,
        clientY
      );
    };

    dispose.raycastCraftSurface = (clientX, clientY) => {
      if (!resources?.modelRoot || !resources.camera || !resources.renderer) return null;
      return raycastCraftSurfaceFromClient(
        resources.renderer,
        resources.camera,
        resources.modelRoot,
        clientX,
        clientY,
        window.THREE
      );
    };

    dispose.resize = () => {
      resizeViewer();
    };

    return dispose;
  }

  Object.assign(window.CS2SkinViewer || (window.CS2SkinViewer = {}), {
    WEAR_OPTIONS,
    WEAR_FLOAT_DEFAULTS,
    wearLabelFromFloat,
    parseSkinLink,
    parseSkinportSlug,
    resolveCatalogItem,
    resolveSkinModelMeta,
    resolveSkinViewerAssets,
    resolveLocalModelUrl,
    isUnpaintedBaseModelUrl,
    resolveCrafterLookupKey,
    findCrafterLibraryEntry,
    resolveCrafterBakedModelUrl,
    loadCrafterBatchLibrary,
    getCrafterBatchLibrary,
    resolveVisualType,
    buildSkinViewerRarityStyle,
    buildWearMarketHashName,
    buildSteamMarketUrl,
    buildItemPageHref,
    itemHasWearVariants,
    splitSteamWearName,
    mountSkinViewer,
    hideShotgunShellMeshes,
    hideXm1014ShellMeshes,
    isXm1014ViewerItem,
    isShotgunShellViewerItem,
    enhanceViewerMaterials,
    normalizeGunPresentation,
    applyWeaponPoseCorrection,
    weaponPoseCorrectionKey,
    applyWeaponInspectPose,
    applyCharmInspectPresentation,
    looksLikeCharmInspectModel,
    centerGunModelInView,
    resolveStandardGunCameraPlacement,
    resolveCharmInspectCameraPlacement,
    testGunPresentationPose(modelRoot, three) {
      if (!modelRoot || !three) return { valid: false, score: -Infinity };
      const box = computeViewerBounds(modelRoot, three, {});
      const size = box.getSize(new three.Vector3());
      return {
        valid: isGunPresentationValid(modelRoot, three),
        score: scoreGunPresentationPose(modelRoot, three),
        barrelLeft: isGunBarrelFacingLeft(modelRoot, three),
        stockDown: isGunStockHangingDown(modelRoot, three),
        gripUp: isGunGripPointingUp(modelRoot, three),
        sideProfile: isGunStandingSideProfile(modelRoot, three),
        size: { x: size.x, y: size.y, z: size.z },
      };
    },
  });
})();
