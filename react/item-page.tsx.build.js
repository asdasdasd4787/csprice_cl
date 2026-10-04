(() => {
  (() => {
    const { useEffect, useLayoutEffect, useMemo, useRef, useState } = React;
    const { Layout, classNames, mountPage, useSteamSession, useI18n } = window.CS2React;
    const PAGE_QUERY = new URLSearchParams(window.location.search);
    const QUERY_ITEM_ID = Number.parseInt(PAGE_QUERY.get("item_id") || "1", 10);
    const QUERY_LOOKUP_NAME = String(PAGE_QUERY.get("lookup_name") || "").trim();
    try {
      if (window.history && "scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch (e) {
    }
    const scrollItemPageToTop = () => {
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };
    scrollItemPageToTop();
    const QUERY_MARKET_HASH_NAME = String(PAGE_QUERY.get("market_hash_name") || QUERY_LOOKUP_NAME || "").trim();
    const QUERY_DISPLAY_NAME = String(PAGE_QUERY.get("display_name") || "").trim();
    const QUERY_IMAGE = String(PAGE_QUERY.get("image") || "").trim();
    const QUERY_MARKET_URL = String(PAGE_QUERY.get("market_url") || "").trim();
    const QUERY_TYPE = String(PAGE_QUERY.get("type") || "").trim();
    const QUERY_CATEGORY = String(PAGE_QUERY.get("category") || "").trim();
    const QUERY_ORIGIN = String(PAGE_QUERY.get("origin") || PAGE_QUERY.get("collection") || "").trim();
    const QUERY_TYPE_FILTER = String(PAGE_QUERY.get("type_filter") || "").trim();
    const ITEM_PAGE_AUTH_FLAG = String(PAGE_QUERY.get("auth") || "").toLowerCase();
    const QUERY_COLOR = String(PAGE_QUERY.get("color") || "").trim();
    const QUERY_SELECTED_WEAR = String(PAGE_QUERY.get("selected_wear") || "").trim();
    const QUERY_SINGLE_ITEM = PAGE_QUERY.get("single_item") === "1";
    const QUERY_MODEL = String(PAGE_QUERY.get("model") || "").trim();
    const IS_INVENTORY_CONTEXT = PAGE_QUERY.get("from_inventory") === "1";
    const PRICE_SYMBOL = "€";
    const PRICE_ALERTS_KEY = "cs2_price_alerts";
    const PRICE_NOTIFICATIONS_KEY = "cs2_price_notifications";
    const SKIN_DESCRIPTION_LOOKUP_URL = "assets/steam-market-cache/skin_description_lookup.json?v=20260625-flavor-desc-1";
    const SKIN_ORIGIN_LOOKUP_URL = "assets/steam-market-cache/skin_origin_lookup.json?v=20260710-collection-origin-fix-1";
    const SKIN_FLOAT_LOOKUP_URL = "assets/steam-market-cache/skin_float_lookup.json?v=20260711-wear-filter-1";
    const VIEWER_CAMERA_FOV = 36;
    const ANALYTICS_V2_ENABLED = true;
    const CHART_MAX_RANGE_DAYS = 5e3;
    const DEFAULT_WEAR = "Factory New";
    const DEFAULT_CHART_DRAW_TOOLS = window.CS2ChartDraw?.tools?.length ? window.CS2ChartDraw.tools : [
      { id: "cursor", word: "Cursor", label: "Cursor", hint: "Return to the normal pointer. Pan and read prices without drawing.", fa: "fa-solid fa-arrow-pointer", paths: [{ d: "M5 2.6l.15 12.1 3.05-3.25 2.35 5.15 1.85-.85-2.35-5.05 4.4-.1z", fill: "currentColor" }] },
      { id: "trendline", word: "Trendline", label: "Trendline", hint: "Click two points to draw a straight support or resistance line.", fa: "fa-solid fa-slash", paths: [{ d: "M4.5 13.5L13.5 4.5" }] },
      { id: "ray", word: "Ray", label: "Ray", hint: "Click two points to extend a line forward through future price action.", fa: "fa-solid fa-arrow-trend-up", paths: [{ d: "M4.5 13.5L13.5 5.5" }, { d: "M10.5 5.5h3v3", strokeWidth: 1.1 }] },
      { id: "hline", word: "Horizontal", label: "Horizontal", hint: "Click once to place a flat price level across the chart.", fa: "fa-solid fa-minus", paths: [{ d: "M3 9h12" }] },
      { id: "vline", word: "Vertical", label: "Vertical", hint: "Click once to mark a date or time on the chart.", fa: "fa-solid fa-grip-lines-vertical", paths: [{ d: "M9 3v12" }] },
      { id: "fib", word: "Fibonacci", label: "Fibonacci", hint: "Drag between a swing low and high to plot retracement levels.", fa: "fa-solid fa-layer-group", paths: [{ d: "M3 5.5h12" }, { d: "M3 9h12" }, { d: "M3 12.5h12" }, { d: "M13.5 5.5v7", strokeWidth: 1.1 }] },
      { id: "rect", word: "Rectangle", label: "Rectangle", hint: "Drag a box to highlight a price and time range.", fa: "fa-regular fa-square", paths: [{ d: "M4.5 4.5h9v9h-9z" }] },
      { id: "parallel", word: "Channel", label: "Channel", hint: "Draw a base line, then a third point to set parallel channel width.", fa: "fa-solid fa-grip-lines", faMod: "tv-draw-tool-icon--channel", paths: [{ d: "M4.5 12.5L12.5 4.5" }, { d: "M6.5 14.5L14.5 6.5" }] },
      { id: "brush", word: "Brush", label: "Brush", hint: "Freehand sketch notes or paths directly on the chart.", fa: "fa-solid fa-pen", paths: [{ d: "M4.5 13.5c2-2.5 3.5-4 5.5-5.5 1.2-.9 2.4-1.2 3.2-.4.8.8.5 2-.4 3.2-1.5 2-3 3.5-5.5 5.5-.8.7-1.8 1-2.8.2z" }] },
      { id: "text", word: "Text", label: "Text", hint: "Click to add a short label or note on the chart.", fa: "fa-solid fa-font", paths: [{ d: "M5.5 4.5h7" }, { d: "M9 4.5v9" }] },
      { id: "measure", word: "Measure", label: "Measure", hint: "Drag between two points to see price change and percent move.", fa: "fa-solid fa-ruler-combined", paths: [{ d: "M4.5 5.5h9v7h-9z", strokeWidth: 1.1 }, { d: "M4.5 9h9", strokeWidth: 1 }, { d: "M9 5.5v7", strokeWidth: 1 }] },
      { id: "clear", word: "Clear", label: "Clear", hint: "Remove every drawing from the chart.", fa: "fa-regular fa-trash-can", paths: [
        { d: "M6.5 4.75h5" },
        { d: "M7.75 4.75V3.85h2.5v.9" },
        { d: "M5.25 6.15h7.5" },
        { d: "M6.15 6.15l.55 8.1h4.6l.55-8.1" },
        { d: "M8.1 8.1v4.2", strokeWidth: 1.2 },
        { d: "M9.9 8.1v4.2", strokeWidth: 1.2 }
      ] }
    ];
    const DEFAULT_CHART_DRAW_GROUPS = [
      { tools: ["cursor"] },
      { tools: ["trendline", "ray", "hline", "vline"] },
      { tools: ["fib"] },
      { tools: ["rect", "parallel", "brush"] },
      { tools: ["text"] },
      { tools: ["measure"] },
      { tools: ["clear"], utility: true }
    ];
    const DEFAULT_ITEM_DETAILS = {
      title: "M4A1-S | Vaporwave",
      collectionName: "Gallery Collection",
      collectionImage: "assets/collections/the_gallery_collection.png",
      image: "assets/weapons/rifles/m4a1s-vaporwave-clean.png",
      steamLink: "https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Vaporwave",
      description: "It has been custom painted with a Greco-Roman statue and other distorted imagery from a bygone era.",
      added: "4 October 2024",
      update: "The Armory"
    };
    const USP_PROGRESIVE_MODEL_URL = "assets/models/weapons/usp_s_progresive/usp_progresive.glb?v=20260911-usp-3d-1";
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
      { matches: ["nova | ripple"], url: "assets/models/skins/nova_ripple.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | drakkar"], url: "assets/models/skins/nova_drakkar.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | featherswing"], url: "assets/models/skins/nova_featherswing.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | hunter brute"], url: "assets/models/skins/nova_hunter_brute.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | hyperbeast"], url: "assets/models/skins/nova_hyperbeast.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | koi"], url: "assets/models/skins/nova_koi.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | morning sun"], url: "assets/models/skins/nova_morning_sun.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | ocular adjusted"], url: "assets/models/skins/nova_ocular_adjusted.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | polymer"], url: "assets/models/skins/nova_polymer.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | ranger"], url: "assets/models/skins/nova_ranger.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | rising sun"], url: "assets/models/skins/nova_rising_sun.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | skull 16"], url: "assets/models/skins/nova_skull_16.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | sobek"], url: "assets/models/skins/nova_sobek.glb?v=20260915-crafter-import-1" },
      { matches: ["nova | toysoldier"], url: "assets/models/skins/nova_toysoldier.glb?v=20260915-crafter-import-1" },
      { matches: ["r8 revolver | survivalist"], url: "assets/models/skins/revoler_survivalist.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | anubis"], url: "assets/models/skins/ak47_anubis.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | asiimov"], url: "assets/models/skins/ak47_asiimov.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | autoexec camo"], url: "assets/models/skins/ak47_autoexec_camo.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | aztec"], url: "assets/models/skins/ak47_aztec.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | bloodsport"], url: "assets/models/skins/ak47_bloodsport.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | cogthings"], url: "assets/models/skins/ak47_cogthings.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | courage"], url: "assets/models/skins/ak47_courage.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | crane flight color"], url: "assets/models/skins/ak47_crane_flight_color.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | empress"], url: "assets/models/skins/ak47_empress.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | explosive"], url: "assets/models/skins/ak47_explosive.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | gold arabesque"], url: "assets/models/skins/ak47_gold_arabesque.glb?v=20260915-crafter-import-1" },
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
      { matches: ["ak-47 | overpass monster"], url: "assets/models/skins/ak47_overpass_monster.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | jaguar"], url: "assets/models/skins/ak47_jaguar.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | panther"], url: "assets/models/skins/ak47_panther.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | rubber"], url: "assets/models/skins/ak47_rubber.glb?v=20260915-crafter-import-1" },
      { matches: ["ak-47 | tribute"], url: "assets/models/skins/ak47_tribute.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | overpass aqua"], url: "assets/models/skins/deagle_overpass_aqua.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | aggressor"], url: "assets/models/skins/deagle_aggressor.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | aureus"], url: "assets/models/skins/deagle_aureus.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | calligraff"], url: "assets/models/skins/deagle_calligraff.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | corinthian"], url: "assets/models/skins/deagle_corinthian.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | eastern enigma blue"], url: "assets/models/skins/deagle_eastern_enigma_blue.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | exo"], url: "assets/models/skins/deagle_exo.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | fennec"], url: "assets/models/skins/deagle_fennec.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | firebreathing"], url: "assets/models/skins/deagle_firebreathing.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | kitch"], url: "assets/models/skins/deagle_kitch.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | mecha"], url: "assets/models/skins/deagle_mecha.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | naga"], url: "assets/models/skins/deagle_naga.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | replica"], url: "assets/models/skins/deagle_replica.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | etched"], url: "assets/models/skins/deagle_etched.glb?v=20260915-crafter-import-1" },
      { matches: ["desert eagle | pilot"], url: "assets/models/skins/deagle_pilot.glb?v=20260915-crafter-import-1" },
      { matches: ["mp7 | constellation dark"], url: "assets/models/skins/mp7_constellation_dark.glb?v=20260915-crafter-import-1" },
      { matches: ["mp7 | commander"], url: "assets/models/skins/mp7_commander.glb?v=20260915-crafter-import-1" },
      { matches: ["mp7 | replica"], url: "assets/models/skins/mp7_replica.glb?v=20260915-crafter-import-1" },
      { matches: ["mp7 | nemesis"], url: "assets/models/skins/mp7_nemesis.glb?v=20260915-crafter-import-1" },
      { matches: ["mp9 | arctic"], url: "assets/models/skins/mp9_arctic.glb?v=20260915-crafter-import-1" },
      { matches: ["mp9 | fuji"], url: "assets/models/skins/mp9_fuji.glb?v=20260915-crafter-import-1" },
      { matches: ["mp9 | prototype extended overlay"], url: "assets/models/skins/mp9_prototype_extended_overlay.glb?v=20260915-crafter-import-1" },
      { matches: ["p250 | coridium contour blue"], url: "assets/models/skins/p250_coridium_contour_blue.glb?v=20260915-crafter-import-1" },
      { matches: ["p250 | inferno"], url: "assets/models/skins/p250_inferno.glb?v=20260915-crafter-import-1" },
      { matches: ["p250 | verdigris"], url: "assets/models/skins/p250_verdigris.glb?v=20260915-crafter-import-1" },
      { matches: ["usp-s | progressive", "usp-s | progresive", "usp-s | progressiv"], url: USP_PROGRESIVE_MODEL_URL },
      { matches: ["ak-47 | point disarray"], url: "assets/models/akk.glb?v=20260704-point-disarray-1" },
      { matches: ["ak-47 | cartel"], url: "assets/models/cartel.glb?v=20260808-cartel-1" },
      { matches: ["m4a1-s | vaporwave"], url: "assets/models/m4blendmodel.glb" },
      { matches: ["m4a1-s | quick liquidation"], url: "assets/models/glb/m4a1s_quick_liquidation.glb" },
      { matches: ["aug | torque"], url: "assets/models/crafter/aug.glb?v=20260704-crafter-batch-2" },
      { matches: ["awp | exothermic"], url: "assets/models/crafter/awp.glb?v=20260704-crafter-batch-2" },
      { matches: ["awp | ice coaled"], url: "assets/models/crafter/awp.glb?v=20260704-crafter-batch-2" },
      { matches: ["desert eagle | starcade"], url: "assets/models/crafter/deagle.glb?v=20260704-crafter-batch-2" },
      { matches: ["famas | byproduct"], url: "assets/models/crafter/famas.glb?v=20260704-crafter-batch-2" },
      { matches: ["glock-18 | wasteland rebel"], url: "assets/models/crafter/glock.glb?v=20260704-crafter-batch-2" },
      { matches: ["m4a1-s | party animal"], url: "assets/models/crafter/m4as.glb?v=20260704-crafter-batch-2" },
      { matches: ["mac-10 | bronzer"], url: "assets/models/crafter/mac.glb?v=20260704-crafter-batch-2" },
      { matches: ["mp5-sd | picnic"], url: "assets/models/crafter/mp5.glb?v=20260704-crafter-batch-2" },
      { matches: ["mp5-sd | savannah halftone"], url: "assets/models/crafter/mp5.glb?v=20260704-crafter-batch-2" },
      { matches: ["mp9 | bee-tron"], url: "assets/models/crafter/mp9.glb?v=20260704-crafter-batch-2" },
      { matches: ["negev | raw ceramic"], url: "assets/models/crafter/negev.glb?v=20260704-crafter-batch-2" },
      { matches: ["p250 | red tide"], url: "assets/models/crafter/p250.glb?v=20260704-crafter-batch-2" },
      { matches: ["ssg 08 | calligrafaux"], url: "assets/models/crafter/ssg.glb?v=20260704-crafter-batch-2" },
      { matches: ["ump-45 | warm blooded"], url: "assets/models/crafter/umps.glb?v=20260704-crafter-batch-2" },
      { matches: ["galil ar | sky mandala"], url: "assets/models/crafter/galil.glb?v=20260704-crafter-batch-2" },
      { matches: ["m4a4 | royal paladin"], url: "assets/models/crafter/m4as.glb?v=20260704-crafter-batch-2" },
      { matches: ["nova | antique"], url: "assets/models/crafter/nova.glb?v=20260704-crafter-batch-2" },
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
      { matches: ["xm1014"], url: "assets/models/base/weapons/models/xm1014/weapon_shot_xm1014.glb" }
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
      { matches: ["bayonet"], url: "assets/models/base/weapons/models/knife/knife_bayonet/weapon_knife_bayonet.glb" }
    ];
    function resolveKnifeModelUrl(itemTitle2) {
      const weaponPart = String(itemTitle2 || "").replace(/^★\s*/u, "").split("|")[0].trim().toLowerCase();
      if (!weaponPart) {
        return "";
      }
      for (const entry of KNIFE_MODEL_TOKENS) {
        if (entry.matches.some((match) => weaponPart.includes(match))) {
          return entry.url;
        }
      }
      return "";
    }
    function resolveQueryOverrideModelUrl(modelParam) {
      const key = String(modelParam || "").trim().toLowerCase().replace(/\.glb$/i, "").replace(/-/g, "_").replace(/\s+/g, "_");
      if (!key) {
        return "";
      }
      if (key === "usp_progresive" || key === "usp_progressive" || key === "usps_progresive" || key === "usps_progressive" || key === "usp_s_progresive" || key === "usp_s_progressive" || key === "progresive" || key === "progressive") {
        return USP_PROGRESIVE_MODEL_URL;
      }
      return "";
    }
    function resolveLocalModelUrl(itemTitle2) {
      const knifeUrl = resolveKnifeModelUrl(itemTitle2);
      if (knifeUrl) {
        return knifeUrl;
      }
      const normalized = String(itemTitle2 || "").toLowerCase();
      const entry = LOCAL_MODEL_MATCHERS.find((candidate) => candidate.matches.some((match) => normalized.includes(match)));
      return entry?.url || "";
    }
    function isUnpaintedBaseModelUrl(url) {
      const helper = window.CS2SkinViewer?.isUnpaintedBaseModelUrl;
      if (typeof helper === "function") {
        return helper(url);
      }
      return /assets\/models\/base\//i.test(String(url || ""));
    }
    function itemPageModelLookupNames(itemTitle2) {
      return [
        itemTitle2,
        QUERY_MARKET_HASH_NAME,
        QUERY_DISPLAY_NAME,
        QUERY_LOOKUP_NAME
      ];
    }
    function resolveCrafterLibraryBakedEntry(libraryItems, names) {
      const helper = window.CS2SkinViewer || {};
      if (typeof helper.findCrafterLibraryEntry === "function") {
        const entry = helper.findCrafterLibraryEntry(libraryItems, names);
        if (entry && entry.has_baked_model !== false && String(entry.model_url || "").trim()) {
          return entry;
        }
        return null;
      }
      const items = (Array.isArray(libraryItems) ? libraryItems : []).filter((row) => row && row.has_baked_model !== false && String(row.model_url || "").trim());
      return resolveManifestModelEntry(items, names);
    }
    function resolveItemPageModelUrl(itemTitle2, skinUrl) {
      const queryUrl = resolveQueryOverrideModelUrl(QUERY_MODEL);
      if (queryUrl) {
        return queryUrl;
      }
      const skin = String(skinUrl || "").trim();
      if (skin && !isUnpaintedBaseModelUrl(skin)) {
        return skin;
      }
      const helper = window.CS2SkinViewer || {};
      const cached = typeof helper.getCrafterBatchLibrary === "function" ? helper.getCrafterBatchLibrary() : null;
      const baked = typeof helper.resolveCrafterBakedModelUrl === "function" ? helper.resolveCrafterBakedModelUrl(cached, itemPageModelLookupNames(itemTitle2)) : "";
      if (baked) {
        return baked;
      }
      if (skin) {
        return skin;
      }
      return resolveLocalModelUrl(itemTitle2);
    }
    function normalizeDescriptionLookupKey(name) {
      return String(name || "").replace(/^Souvenir\s+/i, "").replace(/^StatTrak™\s+/i, "").replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "").trim().toLowerCase();
    }
    function buildOriginLookupKeys(name) {
      const raw = String(name || "").trim();
      if (!raw) {
        return [];
      }
      const keys = /* @__PURE__ */ new Set();
      const add = (value) => {
        const key = normalizeDescriptionLookupKey(value);
        if (key) {
          keys.add(key);
        }
      };
      add(raw);
      const withoutStickerPrefix = /^Sticker\s+\|/i.test(raw) && !/^Sticker\s+Slab\s+\|/i.test(raw) ? raw.replace(/^Sticker\s+\|\s+/i, "").trim() : "";
      if (withoutStickerPrefix && withoutStickerPrefix !== raw) {
        add(withoutStickerPrefix);
      }
      const withoutSlabPrefix = /^Sticker\s+Slab\s+\|/i.test(raw) ? raw.replace(/^Sticker\s+Slab\s+\|\s+/i, "").trim() : "";
      if (withoutSlabPrefix && withoutSlabPrefix !== raw) {
        add(withoutSlabPrefix);
      }
      const withoutSouvenirSticker = raw.replace(/^Souvenir\s+Sticker\s+\|\s+/i, "Sticker | ").trim();
      if (withoutSouvenirSticker !== raw) {
        add(withoutSouvenirSticker);
        add(withoutSouvenirSticker.replace(/^Sticker\s+\|\s+/i, ""));
      }
      return [...keys];
    }
    function resolveSkinOriginFromLookup(lookup, names) {
      if (!lookup || typeof lookup !== "object") {
        return "";
      }
      const candidates = Array.isArray(names) ? names : [names];
      for (const name of candidates) {
        for (const key of buildOriginLookupKeys(name)) {
          const hit = lookup[key];
          if (hit) {
            return String(hit).trim();
          }
        }
      }
      return "";
    }
    function resolveStickerOriginFromGroupMap(groupMap, names) {
      if (!groupMap || typeof groupMap !== "object") {
        return "";
      }
      const candidates = Array.isArray(names) ? names : [names];
      for (const name of candidates) {
        for (const key of buildOriginLookupKeys(name)) {
          for (const [groupName, stickerNames] of Object.entries(groupMap)) {
            if (!Array.isArray(stickerNames)) {
              continue;
            }
            const matched = stickerNames.some((entry) => normalizeDescriptionLookupKey(entry) === key);
            if (matched) {
              return String(groupName || "").trim();
            }
          }
        }
      }
      return "";
    }
    let skinDescriptionLookupCache = null;
    let skinDescriptionLookupPromise = null;
    function loadSkinDescriptionLookup() {
      if (skinDescriptionLookupCache) {
        return Promise.resolve(skinDescriptionLookupCache);
      }
      if (skinDescriptionLookupPromise) {
        return skinDescriptionLookupPromise;
      }
      skinDescriptionLookupPromise = fetch(SKIN_DESCRIPTION_LOOKUP_URL, { cache: "no-store" }).then((response) => {
        if (!response.ok) {
          throw new Error(`Skin description lookup failed (${response.status})`);
        }
        return response.json();
      }).then((payload) => {
        const items = payload?.items && typeof payload.items === "object" ? payload.items : {};
        skinDescriptionLookupCache = items;
        return items;
      }).catch((error) => {
        skinDescriptionLookupPromise = null;
        throw error;
      });
      return skinDescriptionLookupPromise;
    }
    let skinOriginLookupCache = null;
    let skinOriginLookupPromise = null;
    function loadSkinOriginLookup() {
      if (skinOriginLookupCache) {
        return Promise.resolve(skinOriginLookupCache);
      }
      if (skinOriginLookupPromise) {
        return skinOriginLookupPromise;
      }
      skinOriginLookupPromise = fetch(SKIN_ORIGIN_LOOKUP_URL, { cache: "no-store" }).then((response) => {
        if (!response.ok) {
          throw new Error(`Skin origin lookup failed (${response.status})`);
        }
        return response.json();
      }).then((payload) => {
        const items = payload?.items && typeof payload.items === "object" ? payload.items : {};
        skinOriginLookupCache = items;
        return items;
      }).catch((error) => {
        skinOriginLookupPromise = null;
        throw error;
      });
      return skinOriginLookupPromise;
    }
    let skinFloatLookupCache = null;
    let skinFloatLookupPromise = null;
    function loadSkinFloatLookup() {
      if (skinFloatLookupCache) {
        return Promise.resolve(skinFloatLookupCache);
      }
      if (skinFloatLookupPromise) {
        return skinFloatLookupPromise;
      }
      skinFloatLookupPromise = fetch(SKIN_FLOAT_LOOKUP_URL, { cache: "no-store" }).then((response) => {
        if (!response.ok) {
          throw new Error(`Skin float lookup failed (${response.status})`);
        }
        return response.json();
      }).then((payload) => {
        const items = payload?.items && typeof payload.items === "object" ? payload.items : {};
        skinFloatLookupCache = items;
        return items;
      }).catch((error) => {
        skinFloatLookupPromise = null;
        throw error;
      });
      return skinFloatLookupPromise;
    }
    function wearBandOverlapsFloatRange(bandMin, bandMax, skinMin, skinMax) {
      const epsilon = 1e-6;
      return Number(skinMin) < Number(bandMax) - epsilon && Number(skinMax) > Number(bandMin) + epsilon;
    }
    function resolveAvailableWearNames(minFloat, maxFloat, allWears = WEAR_ORDER) {
      if (!Number.isFinite(minFloat) || !Number.isFinite(maxFloat) || maxFloat <= minFloat) {
        return [...allWears];
      }
      return FLOAT_BANDS.filter((band) => wearBandOverlapsFloatRange(band.min, band.max, minFloat, maxFloat)).map((band) => band.wear).filter((wear) => allWears.includes(wear));
    }
    function resolveSkinFloatRangeFromLookup(lookup, names) {
      if (!lookup || typeof lookup !== "object") {
        return null;
      }
      const candidates = Array.isArray(names) ? names : [names];
      for (const name of candidates) {
        const key = normalizeDescriptionLookupKey(name);
        const hit = lookup[key];
        if (!hit || typeof hit !== "object") {
          continue;
        }
        const minFloat = Number(hit.min_float);
        const maxFloat = Number(hit.max_float);
        if (Number.isFinite(minFloat) && Number.isFinite(maxFloat) && maxFloat > minFloat) {
          return { min_float: minFloat, max_float: maxFloat };
        }
      }
      return null;
    }
    function originMetaLabel(originName) {
      const name = String(originName || "").trim();
      if (!name) {
        return "Source";
      }
      if (/\bcollection\b/i.test(name)) {
        return "Collection";
      }
      if (/\bcapsule\b/i.test(name)) {
        return "Capsule";
      }
      if (/\bterminal\b/i.test(name)) {
        return "Terminal";
      }
      if (/\b(package|parcel)\b/i.test(name)) {
        return "Package";
      }
      if (/\bcase\b/i.test(name)) {
        return "Case";
      }
      if (/\bpack\b/i.test(name)) {
        return "Pack";
      }
      return "Collection";
    }
    const CASE_SIM_KEY_COST = 2.19;
    function looksLikeCapsuleContainer(title, visualType) {
      const name = String(title || "");
      const type = String(visualType || "").toLowerCase();
      if (/\bcapsule\b/i.test(name)) return true;
      if (/\(holo[-/]foil\)/i.test(name)) return true;
      if (/\bautograph\b/i.test(name)) return true;
      if (/\b(challengers|legends|contenders)\b/i.test(name) && /\b20\d{2}\b/.test(name)) return true;
      if (type === "capsules" || type.includes("capsule")) return true;
      return false;
    }
    function looksLikeOpenableContainer(title, visualType, isCaseView) {
      if (isCaseView) return true;
      const name = String(title || "");
      if (looksLikeCapsuleContainer(title, visualType)) return true;
      if (/\b(case|capsule|package|parcel|box|pack)\b/i.test(name)) return true;
      if (/\b(graffiti|spray|sticker|patch|music|autograph|charm|pin)\b/i.test(name) && /\b(case|capsule|package|parcel|box|pack|collection|kit|series|charms)\b/i.test(name)) {
        return true;
      }
      if (/\b(charms?|pins?|music kits?)\b/i.test(name)) return true;
      if (resolveContainerGroupNames(title).length >= 2) return true;
      const type = String(visualType || "").toLowerCase();
      return type === "containers" || type === "cases" || type === "capsules" || type === "packages";
    }
    function containerSimulationLabel(title, visualType, t) {
      const tr = t || ((k, _v, fallback) => fallback);
      if (looksLikeCapsuleContainer(title, visualType)) return tr("item_sim_capsule", null, "Capsule Simulation");
      const name = String(title || "");
      if (/\bterminal\b/i.test(name)) return tr("item_sim_terminal", null, "Terminal Simulator");
      if (/\b(package|parcel|box|pack)\b/i.test(name)) return tr("item_sim_package", null, "Package Simulation");
      if (/\b(graffiti|spray)\b/i.test(name)) return tr("item_sim_pack", null, "Pack Simulation");
      if (/\bmusic\b/i.test(name)) return tr("item_sim_kit", null, "Kit Simulation");
      return tr("item_sim_case", null, "Case Simulation");
    }
    function containerContentsSectionTitle(title, t) {
      const tr = t || ((k, _v, fallback) => fallback);
      const name = String(title || "");
      if (looksLikeCapsuleContainer(name) || /\b(sticker|autograph|patch)\b/i.test(name)) return tr("item_contents_capsule", null, "Items from this capsule");
      if (/\b(graffiti|spray)\b/i.test(name)) return tr("item_contents_pack", null, "Items from this pack");
      if (/\bmusic\b/i.test(name)) return tr("item_contents_kit", null, "Items from this kit");
      if (/\bcharm\b/i.test(name)) return tr("item_contents_pack", null, "Items from this pack");
      if (/\bpin\b/i.test(name)) return tr("item_contents_collection", null, "Items from this collection");
      if (/\b(package|parcel|box|pack)\b/i.test(name)) return tr("item_contents_package", null, "Items from this package");
      if (/\bcase\b/i.test(name)) return tr("item_contents_case", null, "Items from this case");
      return tr("item_contents_container", null, "Items from this container");
    }
    function contentsRarityLabel(rarity, badge = "", t) {
      const tr = t || ((k, _v, fallback) => fallback);
      const badgeLabel = String(badge || "").trim();
      if (badgeLabel) {
        return badgeLabel.replace(/_/g, " ");
      }
      const key = String(rarity || "").toLowerCase();
      if (key === "covert" || key === "extraordinary" || key === "gold") return tr("rarity_covert", null, "Covert");
      if (key === "classified" || key === "exotic") return tr("rarity_classified", null, "Classified");
      if (key === "restricted" || key === "remarkable") return tr("rarity_restricted", null, "Restricted");
      if (key === "industrial") return tr("rarity_industrial", null, "Industrial Grade");
      if (key === "consumer") return tr("rarity_consumer", null, "Consumer Grade");
      if (key === "highgrade" || key === "high-grade") return tr("rarity_highGrade", null, "High Grade");
      if (key === "remarkable") return tr("rarity_remarkable", null, "Remarkable");
      if (key === "exotic") return tr("rarity_exotic", null, "Exotic");
      if (key === "extraordinary") return tr("rarity_extraordinary", null, "Extraordinary");
      return tr("rarity_milSpec", null, "Mil-Spec");
    }
    function contentsRarityHex(rarity) {
      const key = String(rarity || "").toLowerCase().replace(/[\s_-]+/g, "");
      if (key === "covert" || key === "extraordinary" || key === "gold" || key === "contraband") return "EB4B4B";
      if (key === "classified" || key === "exotic") return "D32CE6";
      if (key === "restricted" || key === "remarkable") return "8847FF";
      if (key === "industrial") return "5E98D9";
      if (key === "consumer" || key === "basegrade") return "B0C3D9";
      if (key === "highgrade") return "4B69FF";
      return "4B69FF";
    }
    function contentsItemKey(item, index) {
      return [
        String(item?.weapon || ""),
        String(item?.skin || ""),
        String(item?.flatName || ""),
        String(index)
      ].join("|").toLowerCase();
    }
    function contentsDisplayName(item) {
      const flat = String(item?.flatName || "").trim();
      if (flat) return flat.replace(/^StatTrak\u2122\s+/i, "");
      const weapon = String(item?.weapon || "").trim();
      const skin = String(item?.skin || "").trim();
      if (weapon && skin) return `${weapon} | ${skin}`;
      return skin || weapon || "Unknown item";
    }
    function contentsMarketNames(item) {
      const simApi = window.CS2CaseSimulator || {};
      const wearFn = typeof simApi.wearOptionsForItem === "function" ? simApi.wearOptionsForItem : () => ["Factory New", "Minimal Wear", "Field-Tested"];
      const weaponRaw = String(item?.weapon || "").trim();
      const isWearless = Boolean(item?.noWear) || /^(sticker|patch|charm|agent|pin|music kit|sealed graffiti|graffiti)$/i.test(weaponRaw);
      if (isWearless) {
        const flat = String(item.flatName || item.market_hash_name || contentsDisplayName(item)).trim();
        if (!flat) return [];
        const names = [flat];
        if (!flat.includes("|")) {
          names.push(`Sealed Graffiti | ${flat}`);
          names.push(`Graffiti | ${flat}`);
          names.push(`Sticker | ${flat}`);
          names.push(`Patch | ${flat}`);
          names.push(`Charm | ${flat}`);
        } else if (/^Graffiti\s*\|/i.test(flat) && !/^Sealed Graffiti\s*\|/i.test(flat)) {
          names.push(flat.replace(/^Graffiti\s*\|/i, "Sealed Graffiti |"));
        }
        return Array.from(new Set(names.filter(Boolean)));
      }
      const wears = wearFn(item).slice(0, 3);
      const weapon = weaponRaw;
      const skin = String(item?.skin || "").trim();
      if (weapon && skin) {
        return wears.map((wear) => `${weapon} | ${skin} (${wear})`).filter(Boolean);
      }
      const flatBase = String(item.flatName || item.market_hash_name || contentsDisplayName(item)).trim().replace(/\s*\([^)]*\)\s*$/, "");
      if (!flatBase) return [];
      return wears.map((wear) => `${flatBase} (${wear})`).filter(Boolean);
    }
    function contentsItemHref(item, marketName) {
      const lookup = marketName || contentsMarketNames(item)[0] || contentsDisplayName(item);
      const display = contentsDisplayName(item);
      const params = new URLSearchParams({
        market_hash_name: lookup,
        lookup_name: lookup,
        display_name: display
      });
      const image = String(item?.img || item?.image || "").trim();
      if (image && !/assets\/markets\/steam\.(png|webp)$/i.test(image)) {
        params.set("image", image);
      }
      return `item_page.html?${params.toString()}`;
    }
    function contentsRarityRank(rarity) {
      const key = String(rarity || "").toLowerCase();
      if (key === "covert" || key === "extraordinary" || key === "gold") return 0;
      if (key === "classified") return 1;
      if (key === "restricted") return 2;
      if (key === "milspec" || key === "highgrade" || key === "high-grade") return 3;
      if (key === "industrial") return 4;
      return 5;
    }
    async function fetchContentsSteamPrices(items) {
      const list = Array.isArray(items) ? items : [];
      const nameToKeys = /* @__PURE__ */ new Map();
      const allNames = [];
      list.forEach((item, index) => {
        const key = contentsItemKey(item, index);
        const names = contentsMarketNames(item);
        names.forEach((name) => {
          const lower = String(name).toLowerCase();
          if (!nameToKeys.has(lower)) nameToKeys.set(lower, []);
          nameToKeys.get(lower).push(key);
          allNames.push(name);
        });
      });
      const uniqueNames = Array.from(new Set(allNames.filter(Boolean)));
      const priceByKey = /* @__PURE__ */ new Map();
      if (!uniqueNames.length) return priceByKey;
      const chunkSize = 48;
      for (let i = 0; i < uniqueNames.length; i += chunkSize) {
        const chunk = uniqueNames.slice(i, i + chunkSize);
        try {
          const res = await fetch("get_roi_prices_cached.php", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              source: "steam",
              range: "30d",
              market_hash_names: chunk,
              steam_listing_fallback: true,
              steam_listing_fallback_limit: Math.min(24, chunk.length)
            })
          });
          if (!res.ok) continue;
          const data = await res.json();
          const rows = Array.isArray(data?.items) ? data.items : [];
          rows.forEach((row) => {
            const price = Number(row?.current_price);
            if (!(price > 0)) return;
            const keys = nameToKeys.get(String(row?.market_hash_name || "").toLowerCase()) || [];
            keys.forEach((key) => {
              const prev = priceByKey.get(key);
              if (!prev || price < prev.price) {
                priceByKey.set(key, {
                  price,
                  display: row.current_price_display || formatPrice(price),
                  marketHashName: String(row.market_hash_name || "")
                });
              }
            });
          });
        } catch (_) {
        }
      }
      return priceByKey;
    }
    function containerNeedsKey(title, isCaseView) {
      const name = String(title || "");
      if (looksLikeCapsuleContainer(name) || /\(holo[-/]foil\)/i.test(name)) {
        return false;
      }
      if (/\b(capsule|package|parcel|sticker|patch|music|autograph|graffiti|charm|pin)\b/i.test(name)) {
        return false;
      }
      if (/\bterminal\b/i.test(name)) {
        return false;
      }
      return Boolean(isCaseView) || /\bcase\b/i.test(name);
    }
    function isTerminalContainer(title) {
      return /\bterminal\b/i.test(String(title || ""));
    }
    function resolveContainerGroupNames(title) {
      const data = window.CS2ReactData || {};
      const maps = [
        data.STICKER_GROUP_MAP,
        data.PATCH_GROUP_MAP,
        data.MUSIC_GROUP_MAP,
        data.GRAFFITI_GROUP_MAP,
        data.CHARM_GROUP_MAP,
        data.PIN_GROUP_MAP
      ].filter((map) => map && typeof map === "object");
      const raw = String(title || "").trim();
      const candidates = [raw];
      const pushAlias = (value) => {
        const next = String(value || "").trim();
        if (next && !candidates.includes(next)) candidates.push(next);
      };
      [
        /\s+sticker capsule$/i,
        /\s+autograph capsule$/i,
        /\s+capsule$/i,
        /\s+package$/i,
        /\s+case$/i,
        /\s+box$/i,
        /\s+pack$/i,
        /\s+collection$/i,
        /\s+charms?$/i
      ].forEach((pattern) => {
        pushAlias(raw.replace(pattern, ""));
      });
      pushAlias(raw.replace(/\s+sticker capsule$/i, " Capsule"));
      pushAlias(raw.replace(/\s+sticker\s+/i, " "));
      pushAlias(raw.replace(/Holo-Foil/gi, "Holo/Foil"));
      pushAlias(raw.replace(/Holo\/Foil/gi, "Holo-Foil"));
      if (/40,?000/i.test(raw)) pushAlias(raw.replace(/40,?000/gi, "40K"));
      if (/40\s*k/i.test(raw)) pushAlias(raw.replace(/40\s*k/gi, "40,000"));
      if (/half-life:\s*alyx sticker capsule/i.test(raw)) pushAlias("Half-Life: Alyx");
      if (/warhammer 40/i.test(raw)) {
        pushAlias("Warhammer 40K");
        pushAlias("Warhammer 40,000 Sticker Capsule");
      }
      for (const map of maps) {
        for (const candidate of candidates) {
          const direct = map[candidate];
          if (Array.isArray(direct) && direct.length && direct[0] !== "__ALL__") return direct;
        }
        const lowerSet = new Set(candidates.map((c) => c.toLowerCase()));
        for (const [key, list] of Object.entries(map)) {
          if (lowerSet.has(String(key).toLowerCase()) && Array.isArray(list) && list.length && list[0] !== "__ALL__") {
            return list;
          }
        }
        for (const [key, list] of Object.entries(map)) {
          if (!Array.isArray(list) || !list.length || list[0] === "__ALL__") continue;
          const keyLower = String(key).toLowerCase();
          if (candidates.some((candidate) => {
            const c = candidate.toLowerCase();
            return c.includes(keyLower) || keyLower.includes(c);
          })) {
            return list;
          }
        }
      }
      return [];
    }
    async function loadCaseSimulationContents(title) {
      const simApi = window.CS2CaseSimulator || {};
      const normalize = typeof simApi.normalizeDetailItems === "function" ? simApi.normalizeDetailItems : (payload) => Array.isArray(payload?.items) ? payload.items : [];
      const fromNames = typeof simApi.itemsFromNameList === "function" ? simApi.itemsFromNameList : () => [];
      try {
        const res = await fetch("get_detail_items.php?name=" + encodeURIComponent(title), {
          headers: { Accept: "application/json" }
        });
        if (res.ok) {
          const payload = await res.json();
          const items = normalize(payload);
          if (items.length >= 2) return { items, equalWeight: false };
        }
      } catch (_) {
      }
      const groupNames = resolveContainerGroupNames(title);
      if (groupNames.length >= 2) {
        return { items: fromNames(groupNames), equalWeight: true };
      }
      return { items: [], equalWeight: true };
    }
    function showsItemOriginMeta(visualType, itemTitle2, isCaseView, originName) {
      if (isCaseView) {
        return false;
      }
      if (String(originName || "").trim()) {
        if (visualType === "stickers" || visualType === "skins" || visualType === "knives" || visualType === "gloves") {
          return true;
        }
        return String(itemTitle2 || "").includes(" | ");
      }
      if (visualType === "skins" || visualType === "knives" || visualType === "gloves") {
        return true;
      }
      return false;
    }
    function extractSkinFlavorDescription(value) {
      const raw = String(value || "").trim();
      if (!raw) {
        return "";
      }
      const italicMatch = raw.match(/<i>([\s\S]*?)<\/i>/i);
      if (italicMatch?.[1]) {
        return italicMatch[1].replace(/<\/?i>/gi, "").trim();
      }
      const parts = raw.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const tail = parts[parts.length - 1];
        if (tail && !/^it has been /i.test(tail) && tail.length <= 180) {
          return tail;
        }
      }
      return "";
    }
    function resolveSkinDescriptionFromLookup(lookup, names) {
      if (!lookup || typeof lookup !== "object") {
        return "";
      }
      const candidates = Array.isArray(names) ? names : [names];
      for (const name of candidates) {
        const key = normalizeDescriptionLookupKey(name);
        const hit = lookup[key];
        if (hit) {
          return extractSkinFlavorDescription(String(hit).trim());
        }
      }
      return "";
    }
    function normalizeModelManifestEntries(payload) {
      if (Array.isArray(payload?.items)) return payload.items;
      if (Array.isArray(payload)) return payload;
      if (payload?.items && typeof payload.items === "object") {
        return Object.entries(payload.items).map(([name, entry]) => {
          const row = entry && typeof entry === "object" ? entry : {};
          return {
            ...row,
            market_name: row.market_name || row.market_hash_name || name,
            display_name: row.display_name || name,
            model_url: row.model_url || row.gltf || ""
          };
        }).filter((row) => row.model_url);
      }
      return [];
    }
    function stripItemNamePrefix(value) {
      return String(value || "").trim().replace(/^(\?|★)\s*/u, "");
    }
    function isKnifeItemTitle(itemTitle2) {
      return Boolean(resolveKnifeModelUrl(itemTitle2));
    }
    const GLOVE_WEAPON_NAMES = /* @__PURE__ */ new Set([
      "sport gloves",
      "driver gloves",
      "moto gloves",
      "specialist gloves",
      "hand wraps",
      "bloodhound gloves",
      "broken fang gloves",
      "hydra gloves"
    ]);
    function isGloveItemTitle(itemTitle2) {
      const core = stripItemNamePrefix(itemTitle2).split("|")[0].trim().toLowerCase();
      return GLOVE_WEAPON_NAMES.has(core) || /\bgloves?\b/i.test(core);
    }
    function buildRelatedFinishHref(finish) {
      const lookupName = String(finish?.market_hash_name || "").trim();
      const displayName = String(finish?.base_name || finish?.display_name || lookupName).trim();
      if (!lookupName) {
        return "#";
      }
      return "item_page.html?" + new URLSearchParams({
        lookup_name: lookupName,
        display_name: displayName,
        market_hash_name: lookupName,
        image: finish?.image || ""
      }).toString();
    }
    function isSouvenirHighlightOrigin(originName) {
      return /\b(souvenir highlight package|highlight package)\b/i.test(String(originName || "").trim());
    }
    function isCollectionOriginName(originName) {
      const name = String(originName || "").trim();
      if (!name) {
        return false;
      }
      if (/\bcase\b/i.test(name)) {
        return false;
      }
      if (/\bcapsule\b/i.test(name)) {
        return false;
      }
      if (/\bterminal\b/i.test(name)) {
        return false;
      }
      if (/\bpack\b/i.test(name) && !/\bcollection\b/i.test(name)) {
        return false;
      }
      if (isSouvenirHighlightOrigin(name)) {
        return true;
      }
      if (window.CS2ReactData?.lookupCollectionCatalog?.(name)) {
        return true;
      }
      return /\bcollection\b/i.test(name);
    }
    function resolveCollectionFromSouvenirHighlight(originName) {
      const origin = String(originName || "").trim();
      if (!isSouvenirHighlightOrigin(origin)) {
        return "";
      }
      const lookup = window.CS2ReactData?.lookupCollectionCatalog;
      if (typeof lookup !== "function") {
        return "";
      }
      const mapMatch = origin.match(/\b(20\d{2})\s+([A-Za-z0-9 ]+?)\s+Souvenir/i);
      if (!mapMatch) {
        return "";
      }
      const year = mapMatch[1];
      const mapName = mapMatch[2].trim();
      const candidates = [
        `The ${mapName} ${year} Collection`,
        `The ${mapName} Collection`,
        `The 20${String(Number(year) - 1).slice(-2)} ${mapName} Collection`
      ];
      for (const candidate of candidates) {
        const hit = lookup(candidate);
        if (hit?.name) {
          return String(hit.name).trim();
        }
      }
      return "";
    }
    function resolvePreferredSkinOrigin(rawOrigin, fallbackNames = []) {
      const queryOrigin = String(QUERY_ORIGIN || "").trim();
      if (queryOrigin) {
        return queryOrigin;
      }
      const categoryOrigin = String(QUERY_CATEGORY || "").trim();
      const categoryHit = window.CS2ReactData?.lookupCollectionCatalog?.(categoryOrigin);
      if (categoryHit?.name) {
        return String(categoryHit.name).trim();
      }
      if (/\bcollection\b/i.test(categoryOrigin)) {
        return categoryOrigin;
      }
      const origin = String(rawOrigin || "").trim();
      if (!origin) {
        return "";
      }
      if (isSouvenirHighlightOrigin(origin)) {
        return resolveCollectionFromSouvenirHighlight(origin) || resolveSkinOriginFromLookup(window.CS2ReactData?.__skinOriginLookup || {}, fallbackNames) || "";
      }
      if (/\bcollection\b/i.test(origin) || window.CS2ReactData?.lookupCollectionCatalog?.(origin)) {
        return origin;
      }
      return origin;
    }
    function isArmoryExclusiveOrigin(originName) {
      const origin = String(originName || "").trim();
      if (!origin) {
        return false;
      }
      const catalog = window.CS2ReactData?.lookupCollectionCatalog?.(origin);
      if (catalog && /armory/i.test(String(catalog.category || ""))) {
        return true;
      }
      return /\b(sport\s*&\s*field|graphic design|overpass 2024|train 2025)\b/i.test(origin) || /^limited edition item$/i.test(origin);
    }
    function souvenirLookupSupportsItem(itemTitle2, originName = "") {
      if (isGloveItemTitle(itemTitle2)) {
        return false;
      }
      const helper = window.CS2ReactData?.itemSupportsSouvenirSkin;
      if (typeof helper !== "function") {
        return false;
      }
      const baseName = String(itemTitle2 || "").split("|").slice(0, 2).join("|").trim();
      const cleanBase = stripItemNamePrefix(baseName);
      return helper(cleanBase, originName);
    }
    function qualityRowsHaveSouvenirPrices(rows) {
      return (Array.isArray(rows) ? rows : []).some((row) => positivePrice(row?.souvenirGross) != null || positivePrice(row?.souvenir) != null);
    }
    function isStatTrakDropOrigin(originName) {
      const origin = String(originName || "").trim();
      if (!origin) {
        return false;
      }
      return /\b(case|capsule|terminal)\b/i.test(origin);
    }
    function resolveWearVariantKind(itemTitle2, originName = "", qualityRows = null) {
      if (isGloveItemTitle(itemTitle2)) {
        return null;
      }
      const origin = String(originName || QUERY_ORIGIN || "").trim();
      const catalogHint = origin ? window.CS2ReactData?.catalogWearVariantHint?.(origin) : null;
      if (isStatTrakDropOrigin(origin) || catalogHint === "stattrak") {
        return "stattrak";
      }
      if (catalogHint === "souvenir-eligible" || isCollectionOriginName(origin)) {
        return "souvenir";
      }
      if (qualityRowsHaveSouvenirPrices(qualityRows)) {
        return "souvenir";
      }
      return "stattrak";
    }
    function itemSupportsStatTrak(itemTitle2, originName = "") {
      return resolveWearVariantKind(itemTitle2, originName) === "stattrak";
    }
    function itemSupportsSouvenir(itemTitle2, originName = "") {
      return resolveWearVariantKind(itemTitle2, originName) === "souvenir";
    }
    function buildSouvenirMarketHashName(baseName, wear) {
      const cleanBase = stripItemNamePrefix(String(baseName || "").trim());
      const cleanWear = String(wear || "").trim();
      if (!cleanBase || !cleanWear) {
        return "";
      }
      return `Souvenir ${buildWearMarketHashName(cleanBase, cleanWear)}`;
    }
    function itemNeedsSteamStarPrefix(itemTitle2) {
      const raw = String(itemTitle2 || "").trim();
      if (raw.startsWith("★")) {
        return false;
      }
      const clean = stripItemNamePrefix(raw);
      if (!clean) {
        return false;
      }
      if (isKnifeItemTitle(clean) || isKnifeItemTitle(raw)) {
        return true;
      }
      if (isGloveItemTitle(clean)) {
        return true;
      }
      const hint = [QUERY_CATEGORY, QUERY_TYPE_FILTER, QUERY_TYPE].join(" ").toLowerCase();
      return hint.includes("knife") || hint.includes("glove");
    }
    function ensureSteamStarPrefix(name) {
      const raw = String(name || "").trim();
      if (!raw) {
        return "";
      }
      if (raw.startsWith("★")) {
        return raw;
      }
      const clean = stripItemNamePrefix(raw).trim();
      return clean ? `★ ${clean}` : "";
    }
    function toSteamMarketBaseName(baseName) {
      const clean = stripItemNamePrefix(baseName).trim();
      if (!clean) {
        return "";
      }
      if (itemNeedsSteamStarPrefix(clean) || itemNeedsSteamStarPrefix(baseName)) {
        return ensureSteamStarPrefix(clean);
      }
      return clean;
    }
    function buildSteamWearMarketHashName(baseName, wear) {
      return buildWearMarketHashName(toSteamMarketBaseName(baseName), wear);
    }
    function buildSteamStatTrakMarketHashName(baseName, wear) {
      const steamBase = toSteamMarketBaseName(baseName);
      const cleanWear = String(wear || "").trim();
      if (!steamBase || !cleanWear) {
        return steamBase;
      }
      if (steamBase.startsWith("★ ")) {
        return `★ StatTrak™ ${stripItemNamePrefix(steamBase)} (${cleanWear})`;
      }
      return `StatTrak™ ${buildWearMarketHashName(steamBase, cleanWear)}`;
    }
    function buildSteamSouvenirMarketHashName(baseName, wear) {
      const steamBase = toSteamMarketBaseName(baseName);
      const cleanWear = String(wear || "").trim();
      if (!steamBase || !cleanWear) {
        return "";
      }
      return `Souvenir ${buildWearMarketHashName(steamBase, cleanWear)}`;
    }
    function resolveManifestModelEntry(entries, names) {
      const targets = Array.from(new Set((Array.isArray(names) ? names : [names]).map((value) => normalizeMarketName(value)).filter(Boolean)));
      if (!targets.length) return null;
      const exact = entries.find((entry) => targets.includes(normalizeMarketName(entry?.market_name || entry?.display_name || "")));
      if (exact) return exact;
      return entries.find((entry) => {
        const candidateName = normalizeMarketName(entry?.market_name || entry?.display_name || "");
        if (!candidateName) return false;
        const [candidateBase] = splitSteamWearName(stripItemNamePrefix(candidateName));
        return targets.some((target) => {
          const [targetBase] = splitSteamWearName(stripItemNamePrefix(target));
          const normalizedCandidate = normalizeMarketName(candidateBase);
          const normalizedTarget = normalizeMarketName(targetBase);
          return Boolean(normalizedCandidate && normalizedTarget && normalizedCandidate === normalizedTarget);
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
      const priorityTokens = ["preview", "idle", "pose", "stand", "tools", "default"];
      return list.find((clip) => {
        const clipName = normalizeMarketName(clip?.name);
        return priorityTokens.some((token) => clipName.includes(token));
      }) || list[0];
    }
    function resolvePreviewPoseTime(clip, configuredTime) {
      const explicit = Number(configuredTime);
      if (Number.isFinite(explicit) && explicit >= 0) {
        return explicit;
      }
      const duration = Number(clip?.duration || 0);
      if (!Number.isFinite(duration) || duration <= 0) {
        return 0;
      }
      return Math.max(0.12, Math.min(duration * 0.32, 0.8));
    }
    function normalizeMarketName(value) {
      return String(value || "").trim().toLowerCase();
    }
    function readStoredArray(key) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
      } catch (_error) {
        return [];
      }
    }
    function writeStoredArray(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_error) {
      }
    }
    function normalizeAlertNumber(value) {
      const parsed = Number(String(value || "").replace(",", ".").replace(/[^\d.-]/g, ""));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    function alertPriceCents(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) return null;
      return Math.round(parsed * 100);
    }
    function notificationPrice(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? PRICE_SYMBOL + parsed.toFixed(2) : "current price";
    }
    function upsertPriceNotification(notification) {
      const list = readStoredArray(PRICE_NOTIFICATIONS_KEY);
      const next = [notification, ...list.filter((item) => item.id !== notification.id)].slice(0, 40);
      writeStoredArray(PRICE_NOTIFICATIONS_KEY, next);
      window.dispatchEvent(new CustomEvent("cs2:price-notifications-updated"));
    }
    const ALERT_REARM_HYSTERESIS_CENTS = 1;
    function evaluatePriceAlert(alert, currentPrice, allowNotifications = true) {
      const price = Number(currentPrice);
      if (!Number.isFinite(price) || price <= 0 || !alert) return alert;
      const priceCents = alertPriceCents(price);
      const minCents = alert.min != null ? alertPriceCents(alert.min) : null;
      const maxCents = alert.max != null ? alertPriceCents(alert.max) : null;
      if (priceCents == null) return alert;
      let triggerType = "";
      let thresholdCents = null;
      if (maxCents != null && priceCents > maxCents) {
        triggerType = "above";
        thresholdCents = maxCents;
      } else if (minCents != null && priceCents < minCents) {
        triggerType = "below";
        thresholdCents = minCents;
      }
      if (!triggerType) {
        const prevKey = String(alert.lastTriggerKey || "");
        let stillLatched = false;
        if (prevKey.startsWith("above:") && maxCents != null) {
          stillLatched = priceCents >= maxCents - ALERT_REARM_HYSTERESIS_CENTS;
        } else if (prevKey.startsWith("below:") && minCents != null) {
          stillLatched = priceCents <= minCents + ALERT_REARM_HYSTERESIS_CENTS;
        }
        return {
          ...alert,
          currentPrice: price,
          lastTriggerKey: stillLatched ? prevKey : ""
        };
      }
      const threshold = thresholdCents / 100;
      const triggerKey = triggerType + ":" + threshold.toFixed(2);
      const alreadyLatched = alert.lastTriggerKey === triggerKey;
      if (allowNotifications && !alreadyLatched) {
        const direction = triggerType === "above" ? "rose above" : "dropped below";
        upsertPriceNotification({
          id: alert.key + ":" + triggerKey,
          title: alert.title || "Price alert",
          message: `${alert.sourceLabel || "Market"} price ${direction} ${notificationPrice(threshold)}. Now ${notificationPrice(price)}.`,
          href: alert.href || window.location.href,
          createdAt: Date.now(),
          read: false,
          direction: triggerType === "above" ? "up" : "down"
        });
      }
      return {
        ...alert,
        currentPrice: price,
        triggeredAt: alreadyLatched ? alert.triggeredAt : Date.now(),
        lastTriggerKey: triggerKey
      };
    }
    function ItemPriceAlertModal({ itemName, sourceLabel, existingAlert, currentPrice, onClose, onSave }) {
      const hasCurrent = Number.isFinite(currentPrice) && currentPrice > 0;
      const currentDisplay = hasCurrent ? currentPrice < 1 ? currentPrice.toFixed(4) : currentPrice.toFixed(2) : "";
      const [minPrice, setMinPrice] = useState(existingAlert?.min != null ? String(existingAlert.min) : "");
      const [maxPrice, setMaxPrice] = useState(existingAlert?.max != null ? String(existingAlert.max) : "");
      const [error, setError] = useState("");
      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === "Escape") {
            onClose();
          }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
      }, [onClose]);
      const handleSave = () => {
        const min = normalizeAlertNumber(minPrice);
        const max = normalizeAlertNumber(maxPrice);
        if (min === null && max === null) {
          setError("Enter at least one price threshold.");
          return;
        }
        if (min != null && max != null && min >= max) {
          setError("Minimum must be lower than maximum.");
          return;
        }
        if (hasCurrent) {
          const currentCents = alertPriceCents(currentPrice);
          const minCents = min != null ? alertPriceCents(min) : null;
          const maxCents = max != null ? alertPriceCents(max) : null;
          if (maxCents != null && currentCents != null && currentCents > maxCents) {
            setError(`Maximum must be above the current price (${PRICE_SYMBOL}${currentDisplay}).`);
            return;
          }
          if (minCents != null && currentCents != null && currentCents < minCents) {
            setError(`Minimum must be below the current price (${PRICE_SYMBOL}${currentDisplay}).`);
            return;
          }
        }
        setError("");
        onSave({
          min,
          max,
          email: String(existingAlert?.email || "").trim()
        });
      };
      return /* @__PURE__ */ React.createElement("div", { className: "tv-overlay", onClick: function(event) {
        if (event.target === event.currentTarget) onClose();
      } }, /* @__PURE__ */ React.createElement("div", { className: "tv-modal tv-alert-modal", onClick: function(event) {
        event.stopPropagation();
      } }, /* @__PURE__ */ React.createElement("div", { className: "tv-modal-hdr" }, /* @__PURE__ */ React.createElement("div", { className: "tv-alert-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "Price Alert"), /* @__PURE__ */ React.createElement("p", { className: "tv-modal-item" }, itemName, " · ", sourceLabel))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "tv-modal-x", onClick: onClose, "aria-label": "Close" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark" }))), /* @__PURE__ */ React.createElement("div", { className: "tv-alert-fields" }, /* @__PURE__ */ React.createElement("label", { className: "tv-alert-label" }, "Minimum Price (€)"), /* @__PURE__ */ React.createElement(
        "input",
        {
          className: "tv-alert-input",
          type: "text",
          inputMode: "decimal",
          placeholder: hasCurrent ? `e.g. ${(currentPrice - 0.05).toFixed(2)} — notify when price drops below` : "Notify when price drops below this",
          value: minPrice,
          onChange: function(event) {
            setMinPrice(event.target.value);
          }
        }
      ), /* @__PURE__ */ React.createElement("label", { className: "tv-alert-label" }, "Maximum Price (€)"), /* @__PURE__ */ React.createElement(
        "input",
        {
          className: "tv-alert-input",
          type: "text",
          inputMode: "decimal",
          placeholder: hasCurrent ? `e.g. ${(currentPrice + 0.05).toFixed(2)} — notify when price rises above` : "Notify when price rises above this",
          value: maxPrice,
          onChange: function(event) {
            setMaxPrice(event.target.value);
          }
        }
      ), error && /* @__PURE__ */ React.createElement("div", { className: "tv-chart-note" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-info" }), " ", error)), /* @__PURE__ */ React.createElement("div", { className: "tv-alert-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "tv-alert-btn secondary", onClick: onClose }, "Cancel"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "tv-alert-btn primary", onClick: handleSave }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-bell", "aria-hidden": "true" }), "Set Alert"))));
    }
    const QUALITY_ROWS = [
      { wear: "Factory New", price: "158.61", stattrak: "182.70" },
      { wear: "Minimal Wear", price: "142.20", stattrak: "165.30" },
      { wear: "Field-Tested", price: "138.45", stattrak: "160.00" },
      { wear: "Well-Worn", price: "129.80", stattrak: "150.10" },
      { wear: "Battle-Scarred", price: "121.50", stattrak: "142.80" }
    ];
    function createEmptyQualityRows() {
      return INSPECT_WEAR_OPTIONS.map((option) => ({
        wear: option.wear,
        price: "—",
        priceAfterTax: "—",
        stattrak: "—",
        stattrakAfterTax: "—",
        souvenir: "—",
        souvenirAfterTax: "—",
        live: false,
        priceGross: null,
        stattrakGross: null,
        souvenirGross: null
      }));
    }
    function indexWearRows(rows) {
      return (Array.isArray(rows) ? rows : []).reduce((lookup, row) => {
        if (row?.wear) {
          lookup[row.wear] = row;
        }
        return lookup;
      }, {});
    }
    function applyLiveWearRows(prevRows, liveRows, options = {}) {
      const replaceMissing = Boolean(options.replaceMissing);
      const liveByWear = indexWearRows(liveRows);
      const prevByWear = indexWearRows(prevRows);
      return INSPECT_WEAR_OPTIONS.map((option) => {
        const wear = option.wear;
        const live = liveByWear[wear] || null;
        const prev = prevByWear[wear] || createEmptyQualityRows().find((row) => row.wear === wear);
        const priceGross = positivePrice(live?.price) ?? positivePrice(prev?.priceGross) ?? (prev?.live ? positivePrice(prev?.price) : null);
        const stattrakGross = positivePrice(live?.stattrak) ?? positivePrice(prev?.stattrakGross) ?? (prev?.live ? positivePrice(prev?.stattrak) : null);
        const souvenirGross = positivePrice(live?.souvenir) ?? positivePrice(prev?.souvenirGross) ?? (prev?.live ? positivePrice(prev?.souvenir) : null);
        const hasLiveValue = priceGross !== null || stattrakGross !== null || souvenirGross !== null;
        const wearFields = buildSteamWearPriceFields(priceGross);
        const stFields = buildSteamWearPriceFields(stattrakGross);
        const svFields = buildSteamWearPriceFields(souvenirGross);
        return {
          wear,
          price: wearFields.price,
          priceAfterTax: wearFields.priceAfterTax,
          stattrak: stFields.price,
          stattrakAfterTax: stFields.priceAfterTax,
          souvenir: svFields.price,
          souvenirAfterTax: svFields.priceAfterTax,
          live: Boolean(prev?.live || hasLiveValue || replaceMissing && live),
          priceGross,
          stattrakGross,
          souvenirGross
        };
      });
    }
    const CRAFT_INSPECT_SEED = 42;
    const INSPECT_WEAR_FLOATS = window.CS2SkinViewer && window.CS2SkinViewer.WEAR_FLOAT_DEFAULTS || {
      "Factory New": 0.03,
      "Minimal Wear": 0.11,
      "Field-Tested": 0.25,
      "Well-Worn": 0.41,
      "Battle-Scarred": 0.75
    };
    function titleLooksLikeWeaponFinish(title) {
      const clean = String(title || "").trim();
      if (!clean.includes("|")) {
        return false;
      }
      if (/^(Sticker Slab|Sticker|Charm|Agent|Patch|Pin|Sealed Graffiti|Graffiti|Music Kit|Collectible|Tool|Key)\s*\|/i.test(clean)) {
        return false;
      }
      return /^(★\s*)?(StatTrak™\s+|Souvenir\s+)?(AK-47|M4A4|M4A1-S|AWP|Glock-18|USP-S|P250|Desert Eagle|FAMAS|Galil AR|AUG|SG 553|MP9|MAC-10|MP7|MP5-SD|UMP-45|P90|PP-Bizon|Nova|XM1014|MAG-7|Sawed-Off|Negev|M249|Tec-9|Five-SeveN|CZ75-Auto|Dual Berettas|R8 Revolver|SSG 08|SCAR-20|G3SG1|P2000|Zeus x27|MP5)\b/i.test(clean);
    }
    function craftInspectPaintWear(wear) {
      const label = String(wear || "").trim();
      const mapped = Number(INSPECT_WEAR_FLOATS[label]);
      return Number.isFinite(mapped) ? mapped : 0.03;
    }
    function buildSkinCrafterUrl(baseName, wear) {
      const params = new URLSearchParams();
      const name = String(baseName || "").trim();
      if (name) {
        params.set("skin", name);
      }
      const wearLabel = String(wear || "").trim();
      if (wearLabel && wearLabel !== "Standard") {
        params.set("wear", wearLabel);
      }
      const query = params.toString();
      return query ? `viewer3d.html?${query}` : "viewer3d.html";
    }
    function launchGeneratedSkinInspect(econ, wear) {
      const builder = window.CS2CraftInspect?.buildCraftInspectUrl;
      if (typeof builder !== "function") {
        return false;
      }
      const defIndex = Number(econ?.def_index);
      const paintIndex = Number(econ?.paint_index);
      if (!(defIndex > 0 && paintIndex > 0)) {
        return false;
      }
      const inspectUrl = builder({
        defIndex,
        paintIndex,
        paintSeed: CRAFT_INSPECT_SEED,
        paintWear: craftInspectPaintWear(wear),
        rarity: Number(econ?.rarity) || 0,
        quality: 4,
        stickers: [],
        keychains: []
      });
      if (window.CS2InspectLaunch?.launchSteamInspectUrl?.(inspectUrl)) {
        return true;
      }
      window.location.assign(inspectUrl);
      return true;
    }
    function itemSupportsInGameInspect(title, visualType) {
      const cleanTitle = String(title || "").trim();
      if (/^(Sticker Slab|Sticker|Charm|Agent|Patch|Pin|Sealed Graffiti|Graffiti|Music Kit|Collectible)\s*\|/i.test(cleanTitle)) {
        return true;
      }
      if (/\b(capsule|case|package|parcel|pack|box|collection)\b/i.test(cleanTitle)) {
        return true;
      }
      if (/\|/.test(cleanTitle) && !/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i.test(cleanTitle) && !/^(?:★|StatTrak|Souvenir)/u.test(cleanTitle) && (/[\'\"]/.test(cleanTitle) || /\b(Cmdr\.|Lt\.|Sgt\.|Col\.|Capt\.|Officer|Soldier|Specialist|Operator|SEAL|FBI|SAS|SWAT|Phoenix|Elite Crew|Sabre|Frogman)\b/i.test(cleanTitle) || String(cleanTitle.split("|")[0] || "").trim().split(/\s+/).length >= 3)) {
        return true;
      }
      const type = String(visualType || "").toLowerCase();
      return ["stickers", "charms", "agents", "patches", "pins", "graffiti", "music", "collectibles", "slab", "containers", "cases", "capsules", "packages"].includes(type);
    }
    function itemTitleExcludesWearVariants(title) {
      const cleanTitle = String(title || "").trim();
      if (!cleanTitle) {
        return true;
      }
      if (/^(Sticker Slab|Sticker|Patch|Sealed Graffiti|Graffiti|Music Kit|Charm|Agent|Pin|Collectible|Tool|Key|Name Tag|Pass)\s*\|/i.test(cleanTitle)) {
        return true;
      }
      if (/^(Storage Unit|Sticker Capsule|Autograph Capsule|Souvenir Package|Patch Pack|Music Kit Box|Graffiti Box|Sticker Collection)\b/i.test(cleanTitle)) {
        return true;
      }
      if (/\bcase\b/i.test(cleanTitle)) {
        return true;
      }
      if (itemSupportsInGameInspect(cleanTitle, "agents") && !/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i.test(cleanTitle) && !/^(?:★|StatTrak|Souvenir)/u.test(cleanTitle) && !/^(AK-47|M4A4|M4A1-S|AWP|Glock|USP-S|P250|Desert Eagle|FAMAS|Galil|AUG|SG 553|MP9|MAC-10|MP7|UMP-45|P90|PP-Bizon|Nova|XM1014|MAG-7|Sawed-Off|Negev|M249|Tec-9|Five-SeveN|CZ75|Dual Berettas|R8|SSG|SCAR|G3SG1)\b/i.test(cleanTitle)) {
        const left = String(cleanTitle.split("|")[0] || "").trim();
        if (/[\'\"]/.test(left) || left.split(/\s+/).length >= 3 || /\b(Cmdr\.|Lt\.|Sgt\.|Col\.|Capt\.)\b/i.test(left)) {
          return true;
        }
      }
      return false;
    }
    function queryItemHasWearVariants(baseName, typeFilter, category, singleItem, isDefaultTemplate) {
      if (isDefaultTemplate) {
        return true;
      }
      if (singleItem) {
        return false;
      }
      const title = String(baseName || "").trim();
      if (!title.includes("|")) {
        return false;
      }
      if (itemTitleExcludesWearVariants(title)) {
        return false;
      }
      const typeHint = String(typeFilter || category || "").toLowerCase();
      if (/(cases|stickers|capsules|patches|music|collectibles|agents|tools|graffiti|pins|keys|charms)/i.test(typeHint)) {
        return false;
      }
      return true;
    }
    const INSPECT_WEAR_OPTIONS = [
      { wear: "Factory New", short: "FN", label: "Factory New", buttonClass: "fn", image: "assets/weapons/rifles/m4a1s-vaporwave-clean.png" },
      { wear: "Minimal Wear", short: "MW", label: "Minimal Wear", buttonClass: "mw", image: "assets/weapons/rifles/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_3HDzaD_vh3oO57WCilkCIrujqNjsH_In7DZgYnWcAiR-MJshO6koDlN7vhsQyLi41HyS.png" },
      { wear: "Field-Tested", short: "FT", label: "Field-Tested", buttonClass: "ft", image: "assets/weapons/rifles/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_3HDzaD_vh3oO57WCilkCIqtjmMj4K3d3OWbVIkW5p4R7YDu0PrlIHjYbyzsweKi4 (1).png" },
      { wear: "Well-Worn", short: "WW", label: "Well-Worn", buttonClass: "ww", image: "assets/weapons/rifles/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_3HDzaD_vh3oO57WCilkCIqtjmMj4K3d3OWbVIkW5p4R7YDu0PrlIHjYbyzsweKi49GmC.png" },
      { wear: "Battle-Scarred", short: "BS", label: "Battle-Scarred", buttonClass: "bs", image: "assets/weapons/rifles/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_3HDzaD_vh3oO57WCilkCIvtjyTg8GodXmePFd2DpckFONe40W_lYbuYu7qslDajo.png" }
    ];
    const WEAR_SERIES_COLORS = {
      "Factory New": "#2eb8a6",
      "Minimal Wear": "#6a9dff",
      "Field-Tested": "#f5c542",
      "Well-Worn": "#f2874a",
      "Battle-Scarred": "#ef5d6f"
    };
    const PRIMARY_MARKET_ROWS = [
      { name: "DMarket", image: "assets/markets/dmarket.png", basePrice: "139.51", fee: "2%", finalPrice: "142.30" },
      { name: "Market.CSGO", image: "assets/markets/marketcsgo.png", basePrice: "140.10", fee: "5%", finalPrice: "147.11" },
      { name: "ShadowPay", image: "assets/markets/shadowpay.png", basePrice: "139.80", fee: "2%", finalPrice: "142.60" },
      { name: "Waxpeer", image: "assets/markets/waxpeer.png", basePrice: "139.50", fee: "2%", finalPrice: "142.29" },
      { name: "Mannco.store", image: "assets/markets/mannco.ico", basePrice: "139.30", fee: "0%", finalPrice: "139.30" },
      { name: "HaloSkins", image: "assets/markets/haloskins.png", basePrice: "139.20", fee: "3%", finalPrice: "143.38" },
      { name: "RapidSkins", image: "assets/markets/rapidskins.png", basePrice: "139.10", fee: "0%", finalPrice: "139.10" },
      { name: "SkinMonkey", image: "assets/markets/skinmonkey.png", basePrice: "138.92", fee: "3%", finalPrice: "143.09" },
      { name: "Steam Market", image: "assets/markets/steam.png", basePrice: "141.23", fee: "15%", finalPrice: "162.41" },
      { name: "CS.Money", image: "assets/markets/csmoney.png", basePrice: "135.74", fee: "2%", finalPrice: "138.45", best: true },
      { name: "skinport", image: "assets/markets/skinport.png", basePrice: "157.04", fee: "1%", finalPrice: "158.61" }
    ];
    const EXTRA_MARKET_ROWS = [
      { name: "Buff.163", image: "assets/markets/buff.webp", basePrice: "137.85", fee: "2.5%", finalPrice: "141.30", extra: true },
      { name: "SkinSwap", image: "assets/markets/skins.png", basePrice: "139.26", fee: "2%", finalPrice: "142.05", extra: true },
      { name: "Lis-Skins", image: "assets/markets/lis-skins.jpg", basePrice: "140.10", fee: "2%", finalPrice: "142.90", extra: true },
      { name: "SkinBurn", image: "assets/markets/images.jfif", basePrice: "141.44", fee: "4%", finalPrice: "147.10", extra: true },
      { name: "Buff Market", image: "assets/markets/buff.webp", basePrice: "138.08", fee: "2.5%", finalPrice: "141.53", extra: true }
    ];
    const DEMO_PRICE_HISTORY = [
      { date: "2026-04-24", price: 147.39, volume: 139 },
      { date: "2026-04-25", price: 147.99, volume: 141 },
      { date: "2026-04-26", price: 148.72, volume: 141 },
      { date: "2026-04-27", price: 149.55, volume: 139 },
      { date: "2026-04-28", price: 150.42, volume: 136 },
      { date: "2026-04-29", price: 151.28, volume: 132 },
      { date: "2026-04-30", price: 152.08, volume: 129 },
      { date: "2026-05-01", price: 152.75, volume: 126 },
      { date: "2026-05-02", price: 153.27, volume: 125 },
      { date: "2026-05-03", price: 153.61, volume: 125 },
      { date: "2026-05-04", price: 153.74, volume: 127 },
      { date: "2026-05-05", price: 153.69, volume: 131 }
    ];
    const MARKET_COLORS = {
      CSFloat: "#ec4899",
      "Buff.163": "#f97316",
      "Buff Market": "#f97316",
      UUSkins: "#3b82f6",
      YouPin898: "#14b8a6",
      Steam: "#6366f1",
      Unknown: "#64748b",
      "White.Market": "#84cc16",
      "SkinSwap CN": "#f43f5e",
      Ecosteam: "#a78bfa",
      "CS.Money": "#fb7185",
      Skinport: "#22d3ee",
      DMarket: "#facc15",
      "Market.CSGO": "#22d3ee",
      ShadowPay: "#a855f7",
      Waxpeer: "#eab308",
      "Mannco.store": "#f43f5e",
      HaloSkins: "#fb7185",
      RapidSkins: "#fbbf24",
      Other: "#0e7490"
    };
    const MARKETPLACE_META = {
      CSFloat: { short: "CF", image: "assets/markets/floatlogo.png?v=20260602", region: "west", payments: ["card", "bank", "crypto"], kyc: true },
      "Buff.163": { short: "BF", image: "assets/markets/buff.webp?v=2", region: "east" },
      UUSkins: { short: "UU", image: "assets/markets/uuskins.png?v=1", region: "west" },
      YouPin898: { short: "YP", image: "assets/markets/youpin898.png?v=1", region: "east" },
      Steam: { short: "ST", image: "assets/markets/steam.png", region: "west", payments: [], kyc: false },
      "Steam Market": { canonical: "Steam", short: "ST", image: "assets/markets/steam.png", region: "west", payments: [], kyc: false },
      Unknown: { short: "UN", region: "west" },
      "White.Market": { short: "WM", image: "assets/markets/whitemarket.webp?v=20260602", region: "west", payments: ["card", "crypto"], kyc: false },
      "SkinSwap CN": { short: "SC", image: "assets/markets/skinswap-cn.jfif?v=1", region: "east" },
      Ecosteam: { short: "EC", image: "assets/markets/ecosteam.jpg?v=1", region: "west" },
      "CS.Money": { short: "CM", image: "assets/markets/csmoney.png", region: "west" },
      "CS.MONEY Bot": { canonical: "CS.Money", short: "CM", image: "assets/markets/csmoney.png", region: "west" },
      Skinport: { short: "SP", image: "assets/markets/skinport.png", region: "west", payments: ["card", "paypal", "bank"], kyc: true },
      skinport: { canonical: "Skinport", short: "SP", image: "assets/markets/skinport.png", region: "west", payments: ["card", "paypal", "bank"], kyc: true },
      DMarket: { short: "DM", image: "assets/markets/dmarket.png", region: "west", payments: ["card", "paypal", "crypto", "bank"], kyc: true },
      "Market.CSGO": { short: "MC", image: "assets/markets/marketcsgo.png", region: "west", payments: ["card", "crypto", "bank"], kyc: true },
      market_csgo: { canonical: "Market.CSGO", short: "MC", image: "assets/markets/marketcsgo.png", region: "west", payments: ["card", "crypto", "bank"], kyc: true },
      ShadowPay: { short: "SH", image: "assets/markets/shadowpay.png", region: "west", payments: ["card", "paypal", "crypto", "bank"], kyc: true },
      shadowpay: { canonical: "ShadowPay", short: "SH", image: "assets/markets/shadowpay.png", region: "west", payments: ["card", "paypal", "crypto", "bank"], kyc: true },
      Waxpeer: { short: "WP", image: "assets/markets/waxpeer.png", region: "west", payments: ["card", "paypal", "crypto"], kyc: true },
      waxpeer: { canonical: "Waxpeer", short: "WP", image: "assets/markets/waxpeer.png", region: "west", payments: ["card", "paypal", "crypto"], kyc: true },
      "Mannco.store": { short: "MS", image: "assets/markets/mannco.ico", region: "west", payments: ["card", "crypto"], kyc: false },
      mannco: { canonical: "Mannco.store", short: "MS", image: "assets/markets/mannco.ico", region: "west", payments: ["card", "crypto"], kyc: false },
      HaloSkins: { short: "HS", image: "assets/markets/haloskins.png", region: "west", payments: ["card", "paypal", "crypto"], kyc: true },
      haloskins: { canonical: "HaloSkins", short: "HS", image: "assets/markets/haloskins.png", region: "west", payments: ["card", "paypal", "crypto"], kyc: true },
      RapidSkins: { short: "RS", image: "assets/markets/rapidskins.png", region: "west", payments: ["card", "paypal", "bank", "crypto"], kyc: false },
      rapidskins: { canonical: "RapidSkins", short: "RS", image: "assets/markets/rapidskins.png", region: "west", payments: ["card", "paypal", "bank", "crypto"], kyc: false },
      SkinMonkey: { short: "SM", image: "assets/markets/skinmonkey.png", region: "west" },
      SkinSwap: { short: "SS", image: "assets/markets/images.jfif", region: "west" },
      "Lis-Skins": { short: "LS", image: "assets/markets/lis-skins.jpg", region: "west" },
      SkinBurn: { short: "SB", image: "assets/markets/skins.png", region: "west" },
      "Buff Market": { short: "BM", image: "assets/markets/buff.webp", region: "east" },
      SkinBaron: { short: "SB", region: "west" },
      Other: { short: "OT", region: "west" }
    };
    const BUY_ORDER_PRIORITY = ["Buff.163", "Ecosteam", "DMarket", "CSFloat", "Steam", "Skinport", "CS.Money"];
    const SELL_ORDER_PRIORITY = ["SkinSwap CN", "YouPin898", "DMarket", "Ecosteam", "UUSkins", "Buff.163", "Steam", "White.Market", "CS.Money"];
    const SUPPLY_FALLBACKS = {
      "1M": [
        { marketplace: "CSFloat", volume: 91, pct: 13.52 },
        { marketplace: "Buff.163", volume: 87, pct: 12.93 },
        { marketplace: "UUSkins", volume: 72, pct: 10.7 },
        { marketplace: "YouPin898", volume: 71, pct: 10.55 },
        { marketplace: "Steam", volume: 59, pct: 8.77 },
        { marketplace: "Skinport", volume: 47, pct: 6.98 },
        { marketplace: "DMarket", volume: 44, pct: 6.54 },
        { marketplace: "Unknown", volume: 43, pct: 6.39 },
        { marketplace: "White.Market", volume: 39, pct: 5.79 },
        { marketplace: "SkinSwap CN", volume: 39, pct: 5.79 },
        { marketplace: "Ecosteam", volume: 37, pct: 5.5 },
        { marketplace: "CS.Money", volume: 30, pct: 4.46 },
        { marketplace: "Other", volume: 58, pct: 8.62 }
      ],
      "6M": [
        { marketplace: "CSFloat", volume: 516, pct: 15.16 },
        { marketplace: "Buff.163", volume: 489, pct: 14.37 },
        { marketplace: "UUSkins", volume: 414, pct: 12.17 },
        { marketplace: "YouPin898", volume: 391, pct: 11.49 },
        { marketplace: "Steam", volume: 354, pct: 10.4 },
        { marketplace: "Skinport", volume: 241, pct: 7.08 },
        { marketplace: "DMarket", volume: 226, pct: 6.64 },
        { marketplace: "CS.Money", volume: 218, pct: 6.4 },
        { marketplace: "White.Market", volume: 196, pct: 5.76 },
        { marketplace: "SkinSwap CN", volume: 183, pct: 5.38 },
        { marketplace: "Ecosteam", volume: 167, pct: 4.91 },
        { marketplace: "Other", volume: 234, pct: 6.88 }
      ],
      "1Y": [
        { marketplace: "CSFloat", volume: 1048, pct: 16.05 },
        { marketplace: "Buff.163", volume: 981, pct: 15.02 },
        { marketplace: "UUSkins", volume: 779, pct: 11.93 },
        { marketplace: "YouPin898", volume: 741, pct: 11.35 },
        { marketplace: "Steam", volume: 698, pct: 10.69 },
        { marketplace: "Skinport", volume: 486, pct: 7.44 },
        { marketplace: "DMarket", volume: 462, pct: 7.07 },
        { marketplace: "CS.Money", volume: 421, pct: 6.45 },
        { marketplace: "White.Market", volume: 386, pct: 5.91 },
        { marketplace: "SkinSwap CN", volume: 354, pct: 5.42 },
        { marketplace: "Ecosteam", volume: 319, pct: 4.89 },
        { marketplace: "Other", volume: 317, pct: 4.86 }
      ]
    };
    const LISTING_FALLBACKS = {
      CSFloat: { best_price: 158.61, fee_pct: 2.5, total_stock: 91, trend_pct: 3.2, wears: [{ wear: "Factory New", best_price: 158.61, stock: 22 }, { wear: "Minimal Wear", best_price: 143, stock: 18 }, { wear: "Field-Tested", best_price: 137, stock: 30 }, { wear: "Well-Worn", best_price: 129, stock: 12 }, { wear: "Battle-Scarred", best_price: 121, stock: 9 }] },
      "Buff.163": { best_price: 152.4, fee_pct: 2, total_stock: 87, trend_pct: 1.8, wears: [{ wear: "Factory New", best_price: 152.4, stock: 18 }, { wear: "Minimal Wear", best_price: 139, stock: 24 }, { wear: "Field-Tested", best_price: 133, stock: 25 }, { wear: "Well-Worn", best_price: 125, stock: 14 }, { wear: "Battle-Scarred", best_price: 117, stock: 6 }] },
      UUSkins: { best_price: 149.9, fee_pct: 3, total_stock: 72, trend_pct: -0.5, wears: [{ wear: "Factory New", best_price: 149.9, stock: 15 }, { wear: "Minimal Wear", best_price: 135, stock: 20 }, { wear: "Field-Tested", best_price: 128, stock: 22 }, { wear: "Well-Worn", best_price: 121, stock: 10 }, { wear: "Battle-Scarred", best_price: 113, stock: 5 }] },
      YouPin898: { best_price: 151, fee_pct: 2.5, total_stock: 71, trend_pct: 2.1, wears: [{ wear: "Factory New", best_price: 151, stock: 14 }, { wear: "Minimal Wear", best_price: 136, stock: 19 }, { wear: "Field-Tested", best_price: 130, stock: 21 }, { wear: "Well-Worn", best_price: 122, stock: 12 }, { wear: "Battle-Scarred", best_price: 114, stock: 5 }] },
      Steam: { best_price: 162.41, fee_pct: 15, total_stock: 59, trend_pct: 0.8, wears: [{ wear: "Factory New", best_price: 162.41, stock: 10 }, { wear: "Minimal Wear", best_price: 149, stock: 16 }, { wear: "Field-Tested", best_price: 140, stock: 18 }, { wear: "Well-Worn", best_price: 131, stock: 9 }, { wear: "Battle-Scarred", best_price: 123, stock: 6 }] },
      Skinport: { best_price: 157.04, fee_pct: 1, total_stock: 39, trend_pct: 1.1, wears: [{ wear: "Factory New", best_price: 157.04, stock: 16 }, { wear: "Minimal Wear", best_price: 141, stock: 11 }, { wear: "Field-Tested", best_price: 134, stock: 7 }, { wear: "Well-Worn", best_price: 126, stock: 3 }, { wear: "Battle-Scarred", best_price: 119, stock: 2 }] },
      "CS.Money": { best_price: 147.5, fee_pct: 2, total_stock: 30, trend_pct: -0.9, wears: [{ wear: "Factory New", best_price: 147.5, stock: 8 }, { wear: "Minimal Wear", best_price: 133, stock: 8 }, { wear: "Field-Tested", best_price: 126, stock: 7 }, { wear: "Well-Worn", best_price: 118, stock: 4 }, { wear: "Battle-Scarred", best_price: 111, stock: 3 }] },
      "White.Market": { best_price: 155.8, fee_pct: 4, total_stock: 39, trend_pct: 0.4, wears: [{ wear: "Factory New", best_price: 155.8, stock: 8 }, { wear: "Minimal Wear", best_price: 140, stock: 10 }, { wear: "Field-Tested", best_price: 133, stock: 12 }, { wear: "Well-Worn", best_price: 124, stock: 5 }, { wear: "Battle-Scarred", best_price: 116, stock: 4 }] },
      "Market.CSGO": { best_price: 140.1, fee_pct: 5, total_stock: 44, trend_pct: 0.5, wears: [{ wear: "Factory New", best_price: 140.1, stock: 9 }, { wear: "Minimal Wear", best_price: 126, stock: 11 }, { wear: "Field-Tested", best_price: 119, stock: 14 }, { wear: "Well-Worn", best_price: 111, stock: 6 }, { wear: "Battle-Scarred", best_price: 104, stock: 4 }] },
      ShadowPay: { best_price: 139.8, fee_pct: 2, total_stock: 36, trend_pct: 0.4, wears: [{ wear: "Factory New", best_price: 139.8, stock: 8 }, { wear: "Minimal Wear", best_price: 125, stock: 10 }, { wear: "Field-Tested", best_price: 118, stock: 12 }, { wear: "Well-Worn", best_price: 110, stock: 4 }, { wear: "Battle-Scarred", best_price: 103, stock: 2 }] },
      Waxpeer: { best_price: 139.5, fee_pct: 2, total_stock: 34, trend_pct: 0.3, wears: [{ wear: "Factory New", best_price: 139.5, stock: 7 }, { wear: "Minimal Wear", best_price: 124.5, stock: 9 }, { wear: "Field-Tested", best_price: 117.5, stock: 11 }, { wear: "Well-Worn", best_price: 109.5, stock: 4 }, { wear: "Battle-Scarred", best_price: 102.5, stock: 3 }] },
      "Mannco.store": { best_price: 139.3, fee_pct: 0, total_stock: 30, trend_pct: 0.2, wears: [{ wear: "Factory New", best_price: 139.3, stock: 6 }, { wear: "Minimal Wear", best_price: 124.3, stock: 8 }, { wear: "Field-Tested", best_price: 117.3, stock: 10 }, { wear: "Well-Worn", best_price: 109.3, stock: 4 }, { wear: "Battle-Scarred", best_price: 102.3, stock: 2 }] },
      HaloSkins: { best_price: 139.2, fee_pct: 3, total_stock: 32, trend_pct: 0.2, wears: [{ wear: "Factory New", best_price: 139.2, stock: 6 }, { wear: "Minimal Wear", best_price: 124, stock: 8 }, { wear: "Field-Tested", best_price: 117, stock: 11 }, { wear: "Well-Worn", best_price: 109, stock: 4 }, { wear: "Battle-Scarred", best_price: 102, stock: 3 }] },
      RapidSkins: { best_price: 139.1, fee_pct: 0, total_stock: 28, trend_pct: 0.1, wears: [{ wear: "Factory New", best_price: 139.1, stock: 5 }, { wear: "Minimal Wear", best_price: 124.1, stock: 7 }, { wear: "Field-Tested", best_price: 117.1, stock: 9 }, { wear: "Well-Worn", best_price: 109.1, stock: 4 }, { wear: "Battle-Scarred", best_price: 102.1, stock: 3 }] },
      DMarket: { best_price: 139.51, fee_pct: 2, total_stock: 44, trend_pct: 0.4, wears: [{ wear: "Factory New", best_price: 139.51, stock: 8 }, { wear: "Minimal Wear", best_price: 125, stock: 10 }, { wear: "Field-Tested", best_price: 118, stock: 14 }, { wear: "Well-Worn", best_price: 110, stock: 6 }, { wear: "Battle-Scarred", best_price: 103, stock: 6 }] },
      "SkinSwap CN": { best_price: 148.7, fee_pct: 3, total_stock: 39, trend_pct: -1.3, wears: [{ wear: "Factory New", best_price: 148.7, stock: 7 }, { wear: "Minimal Wear", best_price: 133.5, stock: 9 }, { wear: "Field-Tested", best_price: 127, stock: 14 }, { wear: "Well-Worn", best_price: 118, stock: 6 }, { wear: "Battle-Scarred", best_price: 110, stock: 3 }] },
      Ecosteam: { best_price: 150.2, fee_pct: 3.5, total_stock: 37, trend_pct: 0.4, wears: [{ wear: "Factory New", best_price: 150.2, stock: 6 }, { wear: "Minimal Wear", best_price: 135.5, stock: 9 }, { wear: "Field-Tested", best_price: 128.5, stock: 13 }, { wear: "Well-Worn", best_price: 120, stock: 5 }, { wear: "Battle-Scarred", best_price: 112, stock: 4 }] }
    };
    const PROVIDER_HISTORY = {
      labels: ["19 Mar", "22 Mar", "25 Mar", "28 Mar", "31 Mar", "3 Apr", "6 Apr", "9 Apr", "12 Apr", "15 Apr", "18 Apr", "21 Apr", "24 Apr", "27 Apr", "30 Apr", "5 May"],
      providers: [
        { name: "Steam", color: "#6366f1", values: [166.2, 165.6, 164.1, 163.5, 164.3, 163.8, 162.9, 162.1, 161.7, 162.4, 161.9, 162.2, 163.1, 162.8, 163.4, 162.41] },
        { name: "Skinport", color: "#22d3ee", values: [159.8, 158.9, 157.6, 156.9, 155.8, 154.4, 153.8, 153.4, 152.9, 152.3, 152, 152.6, 153.1, 154.2, 155.4, 157.04] },
        { name: "CSFloat", color: "#ec4899", values: [161.4, 160.7, 159.9, 158.2, 157.4, 156.3, 156.7, 157.1, 157.8, 158.4, 158.1, 157.6, 158.2, 158.7, 159.1, 158.61] },
        { name: "White.Market", color: "#a855f7", values: [156.8, 156.1, 155.7, 154.8, 154.1, 153.4, 152.8, 152.1, 151.8, 151.4, 151.1, 151.7, 152.2, 152.9, 153.6, 154.4] },
        { name: "Buff.163", color: "#f97316", values: [160.8, 159.3, 157.7, 156.8, 155.4, 153.9, 153.1, 152.5, 151.8, 151.2, 151, 151.6, 152.4, 153.5, 154.4, 155.2] },
        { name: "DMarket", color: "#facc15", values: [145.2, 144.7, 143.9, 143.1, 142.6, 141.9, 141.4, 140.8, 140.2, 139.9, 139.5, 139.2, 139.8, 140.1, 140.5, 139.51] }
      ]
    };
    const PROVIDER_COLORS = PROVIDER_HISTORY.providers.reduce((colors, provider) => {
      colors[provider.name] = provider.color;
      return colors;
    }, {});
    const PROVIDER_RANGE_POINTS = {
      "30D": 8,
      "90D": 14,
      "180D": 16,
      "1Y": 16
    };
    const MARKET_INTEGRATIONS = window["__MARKET_INTEGRATIONS__"] || {};
    const PRICE_SOURCE_OPTIONS = [
      { id: "all", label: "All Sources", requestValue: "" },
      { id: "steam", label: "Steam", requestValue: "Steam" },
      { id: "skinport", label: "Skinport", requestValue: "Skinport" },
      { id: "csfloat", label: "CSFloat", requestValue: "CSFloat" },
      { id: "white_market", label: "White.Market", requestValue: "White.Market" },
      { id: "dmarket", label: "DMarket", requestValue: "DMarket" },
      { id: "market_csgo", label: "Market.CSGO", requestValue: "Market.CSGO" },
      { id: "shadowpay", label: "ShadowPay", requestValue: "ShadowPay" },
      { id: "waxpeer", label: "Waxpeer", requestValue: "Waxpeer" },
      { id: "mannco", label: "Mannco.store", requestValue: "Mannco.store" },
      { id: "haloskins", label: "HaloSkins", requestValue: "HaloSkins" },
      { id: "rapidskins", label: "RapidSkins", requestValue: "RapidSkins" }
    ].filter((opt) => {
      if (opt.id === "all" || opt.id === "steam") return true;
      if (opt.id in MARKET_INTEGRATIONS) return MARKET_INTEGRATIONS[opt.id];
      return true;
    });
    const ANALYTICS_SOURCE_THEME = {
      all: {
        line: "#26a69a",
        fillTop: "rgba(38, 166, 154, 0.12)",
        fillBottom: "rgba(38, 166, 154, 0.01)",
        volumeUp: "rgba(106, 157, 255, 0.28)",
        volumeDown: "rgba(106, 157, 255, 0.22)"
      },
      steam: {
        line: "#2eb8a6",
        fillTop: "rgba(46, 184, 166, 0.24)",
        fillBottom: "rgba(46, 184, 166, 0.02)",
        volume: "#4a90e2",
        volumeLine: "rgba(74, 144, 226, 0.42)",
        volumeFillTop: "rgba(74, 144, 226, 0.24)",
        volumeFillBottom: "rgba(74, 144, 226, 0.03)",
        volumeUp: "rgba(74, 144, 226, 0.34)",
        volumeDown: "rgba(74, 144, 226, 0.34)",
        grid: "rgba(71, 85, 105, 0.24)",
        axisMuted: "#8b9cb3",
        background: "transparent"
      },
      skinport: {
        line: "#4de7c4",
        fillTop: "rgba(77, 231, 196, 0.18)",
        fillBottom: "rgba(77, 231, 196, 0.015)",
        volumeUp: "rgba(77, 231, 196, 0.24)",
        volumeDown: "rgba(255, 130, 130, 0.2)"
      },
      csfloat: {
        line: "#ec4899",
        fillTop: "rgba(236, 72, 153, 0.18)",
        fillBottom: "rgba(236, 72, 153, 0.01)",
        volumeUp: "rgba(236, 72, 153, 0.28)",
        volumeDown: "rgba(255, 112, 112, 0.22)"
      },
      white_market: {
        line: "#a855f7",
        fillTop: "rgba(168, 85, 247, 0.18)",
        fillBottom: "rgba(168, 85, 247, 0.01)",
        volumeUp: "rgba(168, 85, 247, 0.26)",
        volumeDown: "rgba(255, 112, 112, 0.2)"
      },
      dmarket: {
        line: "#facc15",
        fillTop: "rgba(250, 204, 21, 0.17)",
        fillBottom: "rgba(250, 204, 21, 0.01)",
        volumeUp: "rgba(250, 204, 21, 0.25)",
        volumeDown: "rgba(255, 112, 112, 0.2)"
      },
      market_csgo: {
        line: "#22d3ee",
        fillTop: "rgba(34, 211, 238, 0.18)",
        fillBottom: "rgba(34, 211, 238, 0.01)",
        volumeUp: "rgba(34, 211, 238, 0.26)",
        volumeDown: "rgba(255, 112, 112, 0.2)"
      },
      shadowpay: {
        line: "#a855f7",
        fillTop: "rgba(168, 85, 247, 0.18)",
        fillBottom: "rgba(168, 85, 247, 0.01)",
        volumeUp: "rgba(168, 85, 247, 0.26)",
        volumeDown: "rgba(255, 112, 112, 0.2)"
      },
      waxpeer: {
        line: "#eab308",
        fillTop: "rgba(234, 179, 8, 0.18)",
        fillBottom: "rgba(234, 179, 8, 0.01)",
        volumeUp: "rgba(234, 179, 8, 0.26)",
        volumeDown: "rgba(255, 112, 112, 0.2)"
      },
      mannco: {
        line: "#f43f5e",
        fillTop: "rgba(244, 63, 94, 0.18)",
        fillBottom: "rgba(244, 63, 94, 0.01)",
        volumeUp: "rgba(244, 63, 94, 0.26)",
        volumeDown: "rgba(255, 112, 112, 0.2)"
      },
      haloskins: {
        line: "#fb7185",
        fillTop: "rgba(251, 113, 133, 0.18)",
        fillBottom: "rgba(251, 113, 133, 0.01)",
        volumeUp: "rgba(251, 113, 133, 0.26)",
        volumeDown: "rgba(255, 112, 112, 0.2)"
      },
      rapidskins: {
        line: "#fbbf24",
        fillTop: "rgba(251, 191, 36, 0.18)",
        fillBottom: "rgba(251, 191, 36, 0.01)",
        volumeUp: "rgba(251, 191, 36, 0.26)",
        volumeDown: "rgba(255, 112, 112, 0.2)"
      }
    };
    const PRICE_SOURCE_DELTAS = {
      steam: [4.22, 4.68, 4.34, 4.91, 4.57, 4.88, 5.14, 5.39, 5.63, 5.41, 5.06, 4.82],
      skinport: [1.95, 2.11, 2.29, 2.47, 2.62, 2.81, 2.96, 3.12, 3.28, 3.11, 2.84, 2.63],
      csfloat: [3.18, 3.36, 3.61, 3.82, 4.08, 4.25, 4.41, 4.67, 4.88, 4.73, 4.56, 4.31],
      white_market: [2.72, 2.86, 3.02, 3.19, 3.28, 3.34, 3.47, 3.55, 3.44, 3.31, 3.18, 3.06],
      dmarket: [2.18, 2.31, 2.42, 2.56, 2.67, 2.79, 2.93, 3.02, 3.11, 2.98, 2.84, 2.71],
      market_csgo: [1.98, 2.12, 2.24, 2.37, 2.49, 2.61, 2.74, 2.86, 2.94, 2.81, 2.67, 2.54],
      shadowpay: [1.92, 2.05, 2.18, 2.3, 2.42, 2.55, 2.67, 2.79, 2.88, 2.75, 2.61, 2.48],
      waxpeer: [1.86, 1.99, 2.12, 2.24, 2.36, 2.49, 2.61, 2.73, 2.82, 2.69, 2.55, 2.42],
      mannco: [1.84, 1.97, 2.1, 2.22, 2.34, 2.47, 2.59, 2.71, 2.8, 2.67, 2.53, 2.4],
      haloskins: [1.8, 1.93, 2.06, 2.18, 2.3, 2.43, 2.55, 2.67, 2.76, 2.63, 2.49, 2.36],
      rapidskins: [1.78, 1.91, 2.04, 2.16, 2.28, 2.41, 2.53, 2.65, 2.74, 2.61, 2.47, 2.34]
    };
    const PRICE_SOURCE_VOLUME_FACTORS = {
      all: 1,
      steam: 0.84,
      skinport: 0.58,
      csfloat: 1.08,
      white_market: 0.72,
      dmarket: 0.88,
      market_csgo: 1.05,
      shadowpay: 0.92,
      waxpeer: 0.9,
      mannco: 0.75,
      haloskins: 0.88,
      rapidskins: 0.8
    };
    const MAIN_MARKETS = ["CSFloat", "Buff.163", "UUSkins", "YouPin898", "Steam", "Skinport", "CS.Money", "White.Market", "DMarket", "Market.CSGO", "ShadowPay", "Waxpeer", "Mannco.store", "HaloSkins", "RapidSkins", "SkinSwap CN", "Ecosteam"];
    const MARKETPLACE_PRICE_TABLE = [
      { name: "Steam Market", key: "Steam", sourceId: "steam" },
      { name: "Skinport", key: "Skinport", sourceId: "skinport" },
      { name: "CSFloat", key: "CSFloat", sourceId: "csfloat" },
      { name: "White.Market", key: "White.Market", sourceId: "white_market" },
      { name: "DMarket", key: "DMarket", sourceId: "dmarket" },
      { name: "Market.CSGO", key: "Market.CSGO", sourceId: "market_csgo" },
      { name: "ShadowPay", key: "ShadowPay", sourceId: "shadowpay" },
      { name: "Waxpeer", key: "Waxpeer", sourceId: "waxpeer" },
      { name: "Mannco.store", key: "Mannco.store", sourceId: "mannco" },
      { name: "HaloSkins", key: "HaloSkins", sourceId: "haloskins" },
      { name: "RapidSkins", key: "RapidSkins", sourceId: "rapidskins" },
      { name: "CS.Money", key: "CS.Money", sourceId: "" },
      { name: "Buff.163", key: "Buff.163", sourceId: "" },
      { name: "YouPin898", key: "YouPin898", sourceId: "" },
      { name: "UUSkins", key: "UUSkins", sourceId: "" },
      { name: "SkinSwap CN", key: "SkinSwap CN", sourceId: "" },
      { name: "Ecosteam", key: "Ecosteam", sourceId: "" }
    ];
    const PRIMARY_MARKETPLACE_COUNT = 5;
    const WEAR_TABLE_MARKETPLACES = [
      { id: "skinport", label: "Skinport", short: "Skinport" },
      { id: "csfloat", label: "CSFloat", short: "CSFloat" },
      { id: "white_market", label: "White.Market", short: "White.Market" },
      { id: "dmarket", label: "DMarket", short: "DMarket" },
      { id: "market_csgo", label: "Market.CSGO", short: "Market.CSGO" },
      { id: "shadowpay", label: "ShadowPay", short: "ShadowPay" },
      { id: "waxpeer", label: "Waxpeer", short: "Waxpeer" },
      { id: "mannco", label: "Mannco.store", short: "Mannco.store" },
      { id: "haloskins", label: "HaloSkins", short: "HaloSkins" },
      { id: "rapidskins", label: "RapidSkins", short: "RapidSkins" }
    ];
    const WEAR_TABLE_SOURCES = [
      { id: "steam", label: "Steam", short: "Steam" },
      ...WEAR_TABLE_MARKETPLACES
    ];
    const DISTRIBUTION_VISIBLE_MARKETS = ["CSFloat", "Buff.163", "UUSkins", "YouPin898", "Steam", "Skinport", "DMarket", "Market.CSGO", "ShadowPay", "Waxpeer", "Mannco.store", "HaloSkins", "RapidSkins", "White.Market", "SkinSwap CN", "Unknown"];
    const DISTRIBUTION_RANGES = ["1M", "6M", "1Y"];
    const WEAR_ORDER = INSPECT_WEAR_OPTIONS.map((option) => option.wear);
    const FLOAT_BANDS = [
      { wear: "Factory New", short: "FN", min: 0, max: 0.07, color: "#22c55e" },
      { wear: "Minimal Wear", short: "MW", min: 0.07, max: 0.15, color: "#84cc16" },
      { wear: "Field-Tested", short: "FT", min: 0.15, max: 0.38, color: "#f59e0b" },
      { wear: "Well-Worn", short: "WW", min: 0.38, max: 0.45, color: "#fb923c" },
      { wear: "Battle-Scarred", short: "BS", min: 0.45, max: 1, color: "#ef4444" }
    ];
    function splitSteamWearName(value) {
      const trimmed = String(value || "").trim();
      const match = trimmed.match(/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/);
      if (!match) {
        return [trimmed, ""];
      }
      return [String(match[1] || "").trim(), String(match[2] || "").trim()];
    }
    function buildSteamMarketUrlFromHash(marketHashName) {
      const safeName = String(marketHashName || "").trim();
      return safeName ? `https://steamcommunity.com/market/listings/730/${encodeURIComponent(safeName)}?l=english` : DEFAULT_ITEM_DETAILS.steamLink;
    }
    function parseSteamPriceDisplay(value) {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      const normalized = String(value || "").replace(/\u00a0/g, " ").replace(/[^0-9,.-]/g, "").replace(",", ".");
      const parsed = Number.parseFloat(normalized);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    function parseChartPointDateKey(value) {
      const raw = String(value || "").trim();
      if (!raw) {
        return "";
      }
      const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      if (iso) {
        return iso[1];
      }
      if (/^\d+(\.\d+)?$/.test(raw)) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) {
          const ms = n >= 1e12 ? n : n * 1e3;
          const date = new Date(ms);
          const year2 = date.getUTCFullYear();
          if (!Number.isNaN(date.getTime()) && year2 >= 2010 && year2 <= 2100) {
            return date.toISOString().slice(0, 10);
          }
        }
      }
      const steam = raw.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/);
      if (steam) {
        const months = {
          jan: 0,
          feb: 1,
          mar: 2,
          apr: 3,
          may: 4,
          jun: 5,
          jul: 6,
          aug: 7,
          sep: 8,
          oct: 9,
          nov: 10,
          dec: 11
        };
        const month = months[steam[1].toLowerCase()];
        const year2 = Number(steam[3]);
        const day = Number(steam[2]);
        if (month != null && year2 >= 2010) {
          const date = new Date(Date.UTC(year2, month, day));
          if (!Number.isNaN(date.getTime())) {
            return date.toISOString().slice(0, 10);
          }
        }
      }
      const parsed = new Date(raw);
      const year = parsed.getUTCFullYear();
      if (!Number.isNaN(parsed.getTime()) && year >= 2010 && year <= 2100) {
        return parsed.toISOString().slice(0, 10);
      }
      return "";
    }
    function dateOnlyUtc(value) {
      return parseChartPointDateKey(value);
    }
    function filterActivityHistoryByDays(history, days) {
      const rows = Array.isArray(history) ? history : [];
      if (!days || days <= 0 || rows.length < 2) {
        return rows;
      }
      const latestDate = new Date(rows[rows.length - 1]?.date || Date.now());
      if (Number.isNaN(latestDate.getTime())) {
        return rows;
      }
      const cutoff = new Date(latestDate);
      cutoff.setUTCDate(cutoff.getUTCDate() - days);
      const cutoffKey = cutoff.toISOString().slice(0, 10);
      const filtered = rows.filter((point) => String(point?.date || "") >= cutoffKey);
      return filtered.length >= 2 ? filtered : rows;
    }
    function resolveActivityHistoryForRange(activity, range) {
      const byRange = activity?.sales_history_by_range || {};
      const normalizedRange = String(range || "ALL").toUpperCase();
      if (normalizedRange === "30D" && Array.isArray(byRange["30d"])) return byRange["30d"];
      if (normalizedRange === "30D" && Array.isArray(byRange["1m"])) return byRange["1m"];
      if (normalizedRange === "90D" && Array.isArray(byRange["90d"])) return byRange["90d"];
      if (normalizedRange === "90D" && Array.isArray(byRange["3m"])) return byRange["3m"];
      if (normalizedRange === "180D" && Array.isArray(byRange["180d"])) return byRange["180d"];
      if (normalizedRange === "180D" && Array.isArray(byRange["6m"])) return byRange["6m"];
      if (normalizedRange === "1M" && Array.isArray(byRange["1m"])) return byRange["1m"];
      if (normalizedRange === "6M" && Array.isArray(byRange["6m"])) return byRange["6m"];
      if (normalizedRange === "1Y" && Array.isArray(byRange["1y"])) return byRange["1y"];
      if (normalizedRange === "ALL" && Array.isArray(byRange.all)) return byRange.all;
      if (normalizedRange === "MAX" && Array.isArray(byRange.all)) return byRange.all;
      const allHistory = Array.isArray(byRange.all) && byRange.all.length ? byRange.all : Array.isArray(activity?.sales_history) ? activity.sales_history : [];
      const rangeDays = normalizedRange === "7D" ? 7 : normalizedRange === "1M" || normalizedRange === "30D" ? 30 : normalizedRange === "3M" || normalizedRange === "90D" ? 90 : normalizedRange === "6M" || normalizedRange === "180D" ? 180 : normalizedRange === "1Y" ? 365 : normalizedRange === "ALL" || normalizedRange === "MAX" ? 0 : 0;
      return filterActivityHistoryByDays(allHistory, rangeDays);
    }
    function buildSingleMarketAnalyticsBundle(activity, range, marketHashName) {
      if (!activity || activity.success === false) {
        return null;
      }
      const summary = activity.summary || {};
      const rows = resolveActivityHistoryForRange(activity, range);
      const points = (Array.isArray(rows) ? rows : []).map((point) => {
        const price = parseSteamPriceDisplay(point?.price ?? point?.price_display);
        if (!Number.isFinite(price) || price <= 0) {
          return null;
        }
        return {
          date: String(point?.date || dateOnlyUtc(point?.sold_at) || ""),
          price,
          volume: Math.max(1, Number(point?.quantity || point?.volume || 1) || 1)
        };
      }).filter(Boolean);
      const fallbackPrice = parseSteamPriceDisplay(summary.starting_price) ?? parseSteamPriceDisplay(summary.suggested_price) ?? parseSteamPriceDisplay(summary.starting_price_display) ?? parseSteamPriceDisplay(summary.suggested_price_display);
      const currentPrice = points.length ? Number(points[points.length - 1].price) : fallbackPrice;
      const currentVolume = points.length ? Number(points[points.length - 1].volume || 0) : Number(summary.recent_sales_count || 0);
      return {
        success: true,
        item_id: activity.item_id || 0,
        range,
        selected_source: "steam",
        series: {
          steam: {
            id: "steam",
            label: "Steam",
            points,
            point_count: points.length,
            current_price: currentPrice,
            current_volume: currentVolume,
            updated_at: (/* @__PURE__ */ new Date()).toISOString(),
            market_url: activity.steam_url || buildSteamMarketUrlFromHash(marketHashName),
            history_source: activity.history_source || "",
            live_history: isLiveSteamHistorySource(activity.history_source) && points.length >= 2
          }
        },
        snapshot_cards: [
          {
            id: "steam",
            label: "Steam",
            price: currentPrice,
            volume: currentVolume,
            updated_at: (/* @__PURE__ */ new Date()).toISOString(),
            market_url: activity.steam_url || buildSteamMarketUrlFromHash(marketHashName)
          }
        ],
        summary
      };
    }
    function canonicalMarketName(name) {
      return MARKETPLACE_META[name]?.canonical || name;
    }
    function marketColor(name) {
      const canonical = canonicalMarketName(name);
      return MARKET_COLORS[name] || MARKET_COLORS[canonical] || "#38bdf8";
    }
    function getMarketplaceMeta(name) {
      const canonical = canonicalMarketName(name);
      return MARKETPLACE_META[name] || MARKETPLACE_META[canonical] || { short: String(name || "?").slice(0, 2).toUpperCase(), region: "west" };
    }
    function formatDate(value) {
      const date = new Date(value);
      return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }
    function hasIntradaySnapshots(rows) {
      if (!Array.isArray(rows) || rows.length < 2) {
        return false;
      }
      const uniqueDays = new Set(
        rows.map((row) => String(row?.date || "").slice(0, 10)).filter(Boolean)
      );
      return uniqueDays.size < rows.length;
    }
    function formatHistoryAxisLabel(value, includeTime = false, includeYear = false) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return String(value || "");
      }
      if (includeTime) {
        return date.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          ...includeYear ? { year: "numeric" } : {},
          hour: "2-digit",
          minute: "2-digit"
        });
      }
      return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        ...includeYear ? { year: "numeric" } : {}
      });
    }
    function historyAxisNeedsYear(dateKeys, range = "") {
      const rangeKey = String(range || "").toUpperCase();
      if (rangeKey === "ALL" || rangeKey === "MAX" || rangeKey === "1Y") {
        return true;
      }
      const keys = (Array.isArray(dateKeys) ? dateKeys : []).map((key) => String(key || "").slice(0, 10)).filter(Boolean).sort();
      if (keys.length < 2) {
        return false;
      }
      const start = Date.parse(`${keys[0]}T00:00:00Z`);
      const end = Date.parse(`${keys[keys.length - 1]}T00:00:00Z`);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return false;
      }
      return end - start > 400 * 864e5;
    }
    function formatHistoryTooltipLabel(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return String(value || "");
      }
      return date.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    function DrawToolIcon({ paths }) {
      const iconPaths = Array.isArray(paths) ? paths : [];
      return /* @__PURE__ */ React.createElement("svg", { className: "tv-draw-tool-icon", viewBox: "0 0 18 18", "aria-hidden": "true", focusable: "false" }, iconPaths.map((path, index) => /* @__PURE__ */ React.createElement(
        "path",
        {
          key: index,
          d: path.d,
          fill: path.fill || "none",
          stroke: "currentColor",
          strokeWidth: path.strokeWidth || 1.35,
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }
      )));
    }
    function formatPrice(value) {
      return `${PRICE_SYMBOL}${Number(value).toFixed(2)}`;
    }
    function formatTablePrice(value) {
      if (value === null || value === void 0 || value === "") {
        return "—";
      }
      const number = Number(value);
      return Number.isFinite(number) ? number.toFixed(2) : "—";
    }
    function inventorySectionLabel(typeValue) {
      const normalized = String(typeValue || "").toLowerCase();
      if (normalized.includes("rifle")) return "Rifle";
      if (normalized.includes("pistol")) return "Pistol";
      if (normalized.includes("smg")) return "SMG";
      if (normalized.includes("shotgun")) return "Shotgun";
      if (normalized.includes("sniper")) return "Sniper";
      if (normalized.includes("machinegun")) return "Machine Gun";
      if (normalized.includes("glove")) return "Gloves";
      if (normalized.includes("knife")) return "Knife";
      if (normalized.includes("capsule")) return "Capsule";
      if (normalized.includes("package") || normalized.includes("parcel")) return "Package";
      if (normalized.includes("container") || /\bcases?\b/.test(normalized)) return "Case";
      return "Item";
    }
    function displayCatalogCategoryLabel(categoryValue, fallback, titleValue, t) {
      const tr = t || ((k, _v, fb) => fb);
      const title = String(titleValue || "").trim();
      const titleLower = title.toLowerCase();
      const raw = String(categoryValue || "").trim();
      const normalized = raw.toLowerCase();
      if (/\bcapsule\b/i.test(title) || normalized.includes("capsule")) return tr("item_cat_capsules", null, "Capsules");
      if (/\b(package|parcel)\b/i.test(title) || normalized.includes("package") || normalized.includes("parcel")) {
        return tr("item_cat_packages", null, "Packages");
      }
      if (normalized.includes("skin")) return tr("item_cat_weaponSkins", null, "Weapon Skins");
      if (/\bcases?\b/.test(normalized) || normalized.includes("container") || /\bcase\b/i.test(title) && !/\b(capsule|package|parcel)\b/i.test(title)) {
        return tr("nav_cases", null, "Cases");
      }
      if (normalized.includes("sticker") || /^\s*sticker\b/i.test(title) && !/\bcapsule\b/i.test(title)) {
        return tr("nav_stickers", null, "Stickers");
      }
      if (normalized.includes("patch") || /\bpatch(es)?\b/i.test(title)) return tr("item_cat_patches", null, "Patches");
      if (normalized.includes("agent") || /\bagents?\b/i.test(title)) return tr("item_cat_agents", null, "Agents");
      if (normalized.includes("music") || /\bmusic kit\b/i.test(title)) return tr("item_cat_musicKits", null, "Music Kits");
      if (normalized.includes("graffiti") || /\bgraffiti\b/i.test(title)) return tr("item_cat_graffiti", null, "Graffiti");
      if (normalized.includes("charm") || /\bcharm\b/i.test(title)) return tr("item_cat_charms", null, "Charms");
      if (normalized.includes("pin") || /\bpin\b/i.test(title)) return tr("item_cat_pins", null, "Pins");
      if (raw) {
        return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      }
      return fallback || tr("item_cat_fallback", null, "Item");
    }
    function wearShortLabel(wear) {
      const match = INSPECT_WEAR_OPTIONS.find((option) => option.wear === wear);
      return match?.short || "FN";
    }
    function clampNumber(value, min, max) {
      return Math.min(max, Math.max(min, Number(value) || 0));
    }
    function resolveFloatBand(wear) {
      return FLOAT_BANDS.find((band) => band.wear === wear) || FLOAT_BANDS[2];
    }
    function buildFloatValue(wear, itemName) {
      const band = resolveFloatBand(wear);
      const seed = Array.from(String(itemName || wear)).reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const ratio = 0.28 + (seed + WEAR_ORDER.indexOf(wear) * 37) % 47 / 100;
      return clampNumber(Number((band.min + (band.max - band.min) * ratio).toFixed(4)), band.min, band.max);
    }
    function resolveInspectTarget(links, preferredWear) {
      const standardEntry = links?.Standard || null;
      if (standardEntry?.inspect_url) {
        return {
          entry: standardEntry,
          wear: "Standard",
          exact: !preferredWear || preferredWear === "Standard"
        };
      }
      const exactEntry = links?.[preferredWear] || null;
      if (exactEntry?.inspect_url) {
        return { entry: exactEntry, wear: preferredWear, exact: true };
      }
      const preferredIndex = Math.max(0, WEAR_ORDER.indexOf(preferredWear));
      const fallback = WEAR_ORDER.map((wear, index) => ({ wear, index, entry: links?.[wear] || null })).filter((candidate) => candidate.entry?.inspect_url).sort((left, right) => {
        const distanceDelta = Math.abs(left.index - preferredIndex) - Math.abs(right.index - preferredIndex);
        if (distanceDelta !== 0) {
          return distanceDelta;
        }
        return left.index - right.index;
      })[0] || null;
      if (!fallback) {
        return { entry: null, wear: preferredWear, exact: false };
      }
      return { entry: fallback.entry, wear: fallback.wear, exact: false };
    }
    const QUERY_FULL_MARKET_NAME = QUERY_MARKET_HASH_NAME || QUERY_LOOKUP_NAME || (QUERY_SELECTED_WEAR && QUERY_DISPLAY_NAME ? `${QUERY_DISPLAY_NAME} (${QUERY_SELECTED_WEAR})` : QUERY_DISPLAY_NAME);
    const [QUERY_BASE_NAME, QUERY_WEAR_NAME] = splitSteamWearName(QUERY_FULL_MARKET_NAME || QUERY_DISPLAY_NAME);
    const IS_DEFAULT_TEMPLATE_ITEM = !QUERY_FULL_MARKET_NAME && !QUERY_DISPLAY_NAME && !QUERY_IMAGE;
    const HAS_WEAR_VARIANTS = queryItemHasWearVariants(
      QUERY_BASE_NAME || QUERY_DISPLAY_NAME,
      QUERY_TYPE_FILTER,
      QUERY_CATEGORY,
      QUERY_SINGLE_ITEM,
      IS_DEFAULT_TEMPLATE_ITEM
    );
    const SINGLE_ITEM_MARKET_HASH_NAME = QUERY_FULL_MARKET_NAME || QUERY_DISPLAY_NAME || DEFAULT_ITEM_DETAILS.title;
    const IS_DYNAMIC_QUERY_ITEM = !IS_DEFAULT_TEMPLATE_ITEM;
    const USES_EXACT_MARKET_ACTIVITY = IS_DYNAMIC_QUERY_ITEM;
    const PAGE_CATEGORY_LABEL = QUERY_CATEGORY || QUERY_TYPE || DEFAULT_ITEM_DETAILS.collectionName;
    const itemTitle = QUERY_BASE_NAME || QUERY_DISPLAY_NAME || DEFAULT_ITEM_DETAILS.title;
    const caseCatalogEntry = (() => {
      const names = [
        QUERY_BASE_NAME,
        QUERY_DISPLAY_NAME,
        QUERY_MARKET_HASH_NAME,
        QUERY_LOOKUP_NAME,
        QUERY_FULL_MARKET_NAME,
        SINGLE_ITEM_MARKET_HASH_NAME,
        itemTitle
      ];
      const resolve = window.CS2ReactData?.resolveCaseCatalogEntry;
      if (typeof resolve === "function") {
        return resolve(...names);
      }
      const lookup = window.CS2ReactData?.lookupCaseCatalog;
      if (typeof lookup !== "function") return null;
      for (const name of names) {
        const hit = lookup(name);
        if (hit) return hit;
      }
      return null;
    })();
    const IS_CASE_ITEM = Boolean(caseCatalogEntry) && !looksLikeCapsuleContainer(itemTitle) || !HAS_WEAR_VARIANTS && /\bcase\b/i.test(itemTitle) && !/\b(capsule|package|parcel)\b/i.test(itemTitle) && !itemTitle.includes("|");
    const ITEM_DETAILS = {
      ...DEFAULT_ITEM_DETAILS,
      title: itemTitle,
      collectionName: IS_INVENTORY_CONTEXT ? QUERY_TYPE || "Your Inventory" : PAGE_CATEGORY_LABEL,
      collectionImage: IS_DEFAULT_TEMPLATE_ITEM ? DEFAULT_ITEM_DETAILS.collectionImage : "",
      image: QUERY_IMAGE || DEFAULT_ITEM_DETAILS.image,
      steamLink: QUERY_MARKET_URL || buildSteamMarketUrlFromHash(SINGLE_ITEM_MARKET_HASH_NAME),
      description: IS_CASE_ITEM ? caseCatalogEntry?.description || "" : IS_INVENTORY_CONTEXT ? "Tracked in your connected Steam inventory. Open the linked Steam market page or use the live inspect link when one is available." : !HAS_WEAR_VARIANTS && !IS_DEFAULT_TEMPLATE_ITEM ? `Live Steam market detail page for ${QUERY_BASE_NAME || QUERY_DISPLAY_NAME || SINGLE_ITEM_MARKET_HASH_NAME}.` : HAS_WEAR_VARIANTS && IS_DYNAMIC_QUERY_ITEM ? "" : DEFAULT_ITEM_DETAILS.description,
      added: IS_CASE_ITEM ? caseCatalogEntry?.intro ? window.CS2ReactData?.formatCaseIntroDate?.(caseCatalogEntry.intro) ?? caseCatalogEntry.intro : "" : caseCatalogEntry?.intro ? window.CS2ReactData?.formatCaseIntroDate?.(caseCatalogEntry.intro) ?? caseCatalogEntry.intro : IS_DYNAMIC_QUERY_ITEM ? "" : DEFAULT_ITEM_DETAILS.added,
      update: caseCatalogEntry?.category ? caseCatalogEntry.category : IS_INVENTORY_CONTEXT ? "Steam Inventory" : QUERY_TYPE_FILTER ? QUERY_TYPE_FILTER : DEFAULT_ITEM_DETAILS.update
    };
    function formatFee(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return "—";
      return `${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(1)}%`;
    }
    function formatCount(value) {
      return new Intl.NumberFormat("en-US").format(Number(value || 0));
    }
    function positivePrice(value) {
      const parsed = parseSteamPriceDisplay(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    function steamSellerProceeds(grossPrice) {
      const gross = positivePrice(grossPrice);
      if (gross === null) {
        return null;
      }
      return Number((gross / 1.15).toFixed(2));
    }
    function formatSteamListingPrice(grossPrice) {
      const gross = positivePrice(grossPrice);
      return gross !== null ? formatTablePrice(gross) : "—";
    }
    function formatSteamWearTablePrice(grossPrice) {
      const net = steamSellerProceeds(grossPrice);
      return Number.isFinite(net) && net > 0 ? formatTablePrice(net) : "—";
    }
    function buildSteamWearPriceFields(grossPrice) {
      const gross = positivePrice(grossPrice);
      const net = steamSellerProceeds(gross);
      return {
        priceGross: gross,
        price: gross !== null ? formatTablePrice(gross) : "—",
        priceAfterTax: net !== null && net > 0 ? formatTablePrice(net) : "—"
      };
    }
    function renderQualityPriceCell(row, kind) {
      const listing = kind === "stattrak" ? row.stattrak : row.price;
      return /* @__PURE__ */ React.createElement("span", { className: kind === "stattrak" ? "tv-qr-st" : "tv-qr-price" }, listing);
    }
    function itemSupportsWearRows(itemName, wear = "") {
      const cleanName = String(itemName || "").trim();
      if (!cleanName || itemTitleExcludesWearVariants(cleanName)) {
        return false;
      }
      const cleanWear = String(wear || "").trim();
      return Boolean(cleanWear && cleanName.includes("|"));
    }
    function resolveExactMarketHashName(baseName, wear = "", hasWearVariants = true) {
      const cleanBase = String(baseName || "").trim();
      if (!cleanBase) {
        return "";
      }
      if (!hasWearVariants) {
        return toSteamMarketBaseName(cleanBase) || cleanBase;
      }
      return buildSteamWearMarketHashName(cleanBase, wear || DEFAULT_WEAR);
    }
    function buildWearMarketHashName(baseName, wear) {
      const cleanBase = String(baseName || "").trim();
      const cleanWear = String(wear || "").trim();
      if (!cleanBase || !cleanWear) {
        return cleanBase;
      }
      if (/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i.test(cleanBase)) {
        return cleanBase;
      }
      return `${cleanBase} (${cleanWear})`;
    }
    function buildStatTrakMarketHashName(baseName, wear) {
      const cleanBase = String(baseName || "").trim();
      const cleanWear = String(wear || "").trim();
      if (!cleanBase || !cleanWear) {
        return cleanBase;
      }
      return `StatTrak™ ${buildWearMarketHashName(cleanBase, cleanWear)}`;
    }
    function resolveVisualType(categoryValue, typeValue, filterValue, titleValue) {
      const title = String(titleValue || "").trim();
      if (isKnifeItemTitle(title)) {
        return "knives";
      }
      const haystack = [categoryValue, typeValue, filterValue, titleValue].map((value) => String(value || "").toLowerCase()).join(" ");
      if (haystack.includes("knife")) return "knives";
      if (/^★/u.test(title) && title.includes("|") && !haystack.includes("glove")) return "knives";
      if (haystack.includes("glove")) return "gloves";
      if (haystack.includes("pistol")) return "pistols";
      if (haystack.includes("rifle")) return "rifles";
      if (haystack.includes("smg")) return "smgs";
      if (haystack.includes("shotgun")) return "shotguns";
      if (haystack.includes("sniper") || haystack.includes("awp") || haystack.includes("ssg 08")) return "snipers";
      if (haystack.includes("heavy") || haystack.includes("machinegun")) return "heavy";
      if (/\bcapsule\b/.test(haystack) || haystack.includes("capsules")) return "capsules";
      if (/\b(package|parcel)\b/.test(haystack)) return "packages";
      if (/\bcharm\b/.test(haystack) || /\bcharms\b/.test(haystack)) return "charms";
      if (haystack.includes("sticker") || haystack.includes("patch")) return "stickers";
      if (haystack.includes("agent") && !titleLooksLikeWeaponFinish(title)) return "agents";
      if (/\bcases?\b/.test(haystack) || haystack.includes("container")) return "containers";
      return "items";
    }
    const RARITY_HEX_BY_LABEL = {
      covert: "EB4B4B",
      classified: "D32CE6",
      restricted: "8847FF",
      "mil-spec": "4B69FF",
      industrial: "5E98D9",
      consumer: "B0C3D9",
      extraordinary: "E4AE39",
      contraband: "E4AE39",
      "high grade": "CFB97F",
      "base grade": "B0C3D9"
    };
    function sanitizeRarityHex(hexValue) {
      const hex = String(hexValue || "").replace(/^#/, "").trim().toUpperCase();
      return /^[0-9A-F]{6}$/.test(hex) ? hex : "";
    }
    function inferRarityHexFromType(typeNote) {
      const type = String(typeNote || "").toLowerCase();
      if (type.includes("contraband") || type.includes("extraordinary")) return RARITY_HEX_BY_LABEL.extraordinary;
      if (type.includes("covert")) return RARITY_HEX_BY_LABEL.covert;
      if (type.includes("classified")) return RARITY_HEX_BY_LABEL.classified;
      if (type.includes("restricted")) return RARITY_HEX_BY_LABEL.restricted;
      if (type.includes("mil-spec")) return RARITY_HEX_BY_LABEL["mil-spec"];
      if (type.includes("industrial")) return RARITY_HEX_BY_LABEL.industrial;
      if (type.includes("consumer")) return RARITY_HEX_BY_LABEL.consumer;
      if (type.includes("high grade")) return RARITY_HEX_BY_LABEL["high grade"];
      if (type.includes("base grade")) return RARITY_HEX_BY_LABEL["base grade"];
      return "";
    }
    function resolveItemRarityHex(colorValue, typeNote, isDefaultTemplate) {
      return sanitizeRarityHex(colorValue) || inferRarityHexFromType(typeNote) || (isDefaultTemplate ? RARITY_HEX_BY_LABEL.covert : RARITY_HEX_BY_LABEL["mil-spec"]);
    }
    function buildSkinViewerRarityStyle(hexValue) {
      const hex = sanitizeRarityHex(hexValue) || RARITY_HEX_BY_LABEL["mil-spec"];
      const red = Number.parseInt(hex.slice(0, 2), 16);
      const green = Number.parseInt(hex.slice(2, 4), 16);
      const blue = Number.parseInt(hex.slice(4, 6), 16);
      return {
        "--rarity-accent": `#${hex}`,
        "--card-accent": `#${hex}`,
        "--rarity-glow": `rgba(${red}, ${green}, ${blue}, 0.48)`,
        "--rarity-mid": `rgba(${red}, ${green}, ${blue}, 0.24)`,
        "--rarity-deep": `rgba(${Math.max(0, Math.round(red * 0.24))}, ${Math.max(0, Math.round(green * 0.24))}, ${Math.max(0, Math.round(blue * 0.24))}, 0.34)`
      };
    }
    function normalizeQuoteRecord(item) {
      if (!item) return null;
      const price = positivePrice(item.current_price ?? item.current_price_display);
      if (!Number.isFinite(price) || price <= 0) return null;
      const cachedAtSeconds = Number(item._cached_at || 0);
      const updatedAt = item.updated_at || (Number.isFinite(cachedAtSeconds) && cachedAtSeconds > 0 ? new Date(cachedAtSeconds * 1e3).toISOString() : "");
      const listings = Math.max(
        0,
        Math.round(Number(
          item.listings ?? item._white_market_similar_qty ?? item.similarQty ?? item.similar_qty ?? item.sell_orders ?? item.quantity ?? item.market_product_count ?? 0
        ) || 0)
      );
      return {
        market_hash_name: String(item.market_hash_name || item.name || "").trim(),
        price,
        display: item.current_price_display || formatPrice(price),
        listings,
        listings_display: item.listings_display || "",
        market_url: item.market_url || "",
        source: item.source || "",
        source_label: item.source_label || "",
        count_schema: Number(item._csfloat_count_schema || item.count_schema || 0),
        updated_at: updatedAt,
        sparkline: Array.isArray(item.sparkline) ? item.sparkline : [],
        price_history: item.price_history ?? null,
        price_verified: Boolean(item.price_verified || item._white_market_live),
        buy_order_price: positivePrice(item.buy_order_price) || null,
        buy_order_listings: Math.max(0, Math.round(Number(item.buy_order_listings || item.buy_orders || 0) || 0)),
        buy_orders: Math.max(0, Math.round(Number(item.buy_orders || item.buy_order_listings || 0) || 0))
      };
    }
    function normalizeQuoteItem(json) {
      return normalizeQuoteRecord(Array.isArray(json?.items) ? json.items[0] : null);
    }
    function normalizeQuoteItemsByHash(json) {
      const items = Array.isArray(json?.items) ? json.items : [];
      return items.reduce((lookup, item) => {
        const normalized = normalizeQuoteRecord(item);
        if (normalized?.market_hash_name) {
          lookup[normalized.market_hash_name] = normalized;
        }
        return lookup;
      }, {});
    }
    function providerHistoryReferencePrice(providers) {
      const steamProvider = (Array.isArray(providers) ? providers : []).find((entry) => String(entry?.name || "").toLowerCase() === "steam");
      const steamPoints = normalizeAnalyticsSeriesPoints(steamProvider?.points || []);
      const steamPrice = Number(steamPoints[steamPoints.length - 1]?.price || 0);
      if (Number.isFinite(steamPrice) && steamPrice > 0) {
        return steamPrice;
      }
      const lastPrices = (Array.isArray(providers) ? providers : []).flatMap((entry) => normalizeAnalyticsSeriesPoints(entry?.points || [])).map((point) => Number(point.price || 0)).filter((price) => Number.isFinite(price) && price > 0);
      const median = chartSeriesMedian(lastPrices);
      return Number.isFinite(median) && median > 0 ? median : 0;
    }
    function providerOutlierBand(marketplace = false, flatItem = false) {
      if (!marketplace) {
        return { low: 0.12, high: 5 };
      }
      if (flatItem) {
        return { low: 0.35, high: 3.25 };
      }
      return { low: 0.28, high: 1.55 };
    }
    function isProviderPriceOutlier(price, referencePrice, marketplace = false, flatItem = false) {
      const numericPrice = Number(price || 0);
      const numericReference = Number(referencePrice || 0);
      if (!Number.isFinite(numericPrice) || numericPrice <= 0) return true;
      if (!Number.isFinite(numericReference) || numericReference <= 0) return false;
      const ratio = numericPrice / Math.max(0.01, numericReference);
      const band = providerOutlierBand(marketplace, flatItem);
      return ratio > band.high || ratio < band.low;
    }
    function chartSeriesMedian(values) {
      const sorted = values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
      if (!sorted.length) return 0;
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    function filterChartSeriesOutliers(points, referencePrice = 0, marketplace = false, options = {}) {
      const allowLowOutliers = Boolean(options?.allowLowOutliers);
      const normalized = normalizeAnalyticsSeriesPoints(points);
      if (normalized.length < 4) {
        return normalized;
      }
      const prices = normalized.map((point) => point.price);
      const median = chartSeriesMedian(prices);
      const reference = Number(referencePrice) > 0 ? Number(referencePrice) : median;
      const deviations = prices.map((price) => Math.abs(price - median));
      const mad = chartSeriesMedian(deviations) || Math.max(reference * 0.04, 0.01);
      const spread = Math.max(mad * 1.4826, reference * 0.035, 0.01);
      const lowFence = Math.max(0, median - spread * 4);
      const highFence = median + spread * 4;
      return normalized.filter((point) => {
        if (point.price > highFence) {
          return false;
        }
        if (!allowLowOutliers && point.price < lowFence) {
          return false;
        }
        if (reference > 0) {
          const ratio = point.price / reference;
          if (marketplace) {
            if (ratio > 1.55 || ratio < 0.55) {
              return false;
            }
          } else if (ratio > 5 || !allowLowOutliers && ratio < 0.12) {
            return false;
          }
        }
        return true;
      });
    }
    function seriesPriceSpread(points) {
      const prices = normalizeAnalyticsSeriesPoints(points).map((point) => point.price);
      if (prices.length < 2) {
        return 0;
      }
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return max > 0 ? (max - min) / max : 0;
    }
    function deriveProviderSeriesFromSteamShape(steamPoints, providerAnchorPrice2) {
      const steam = normalizeAnalyticsSeriesPoints(steamPoints);
      const anchor = Number(providerAnchorPrice2);
      if (steam.length < 2 || !Number.isFinite(anchor) || anchor <= 0) {
        return [];
      }
      const lastSteamPrice = Number(steam[steam.length - 1].price);
      const baseSteam = lastSteamPrice > 0 ? lastSteamPrice : Number(steam[0].price);
      if (!Number.isFinite(baseSteam) || baseSteam <= 0) {
        return [];
      }
      const scale = anchor / baseSteam;
      return steam.map((point) => ({
        date: point.date,
        price: Number((point.price * scale).toFixed(point.price < 1 ? 4 : 2)),
        volume: Math.max(1, Number(point.volume || 1) || 1)
      })).filter((point) => point.date && point.price > 0);
    }
    function seriesNeedsSteamShape(providerPoints, steamPoints) {
      const steam = normalizeAnalyticsSeriesPoints(steamPoints);
      const provider = normalizeAnalyticsSeriesPoints(providerPoints);
      if (steam.length < 8) {
        return false;
      }
      if (provider.length < 8) {
        return true;
      }
      const steamSpread = seriesPriceSpread(steam);
      const providerSpread = seriesPriceSpread(provider);
      if (steamSpread <= 0) {
        return false;
      }
      return providerSpread < steamSpread * 0.45;
    }
    function providerAnchorPrice(providerId, entry, fallbackEntry, dynamicQuotes) {
      return positivePrice(dynamicQuotes?.[providerId]?.price) || positivePrice(entry?.current_price) || positivePrice(fallbackEntry?.current_price) || null;
    }
    function resolveMergedMarketSeries(dynamicEntry, fallbackEntry, options = {}) {
      const { isSteam = false, activity = null, range = "ALL" } = options;
      const dynamicCount = seriesPointCount(dynamicEntry);
      const fallbackCount = seriesPointCount(fallbackEntry);
      const dynamicSynthetic = seriesLooksSynthetic(dynamicEntry);
      const fallbackSynthetic = seriesLooksSynthetic(fallbackEntry);
      const rangeKey = String(range || "ALL").toUpperCase();
      const preferLongest = rangeKey === "ALL" || rangeKey === "MAX";
      if (isSteam) {
        if (preferLongest && dynamicCount >= 2 && fallbackCount >= 2 && !fallbackSynthetic) {
          const dynamicPoints = normalizeAnalyticsSeriesPoints(dynamicEntry?.points || []);
          const fallbackPoints = normalizeAnalyticsSeriesPoints(fallbackEntry?.points || []);
          const liveAnchor = seriesAnchorPrice(dynamicEntry) || positivePrice(activity?.summary?.starting_price) || positivePrice(activity?.summary?.suggested_price);
          if (liveAnchor && !seriesPriceNearReference(fallbackEntry, liveAnchor, 0.55)) {
            return dynamicEntry;
          }
          const dynamicStart = String(dynamicPoints[0]?.date || "");
          const fallbackStart = String(fallbackPoints[0]?.date || "");
          const fallbackLonger = fallbackCount > dynamicCount * 1.15 || fallbackStart && dynamicStart && fallbackStart < dynamicStart && fallbackCount >= dynamicCount;
          if (fallbackLonger && (!liveAnchor || seriesPriceNearReference(fallbackEntry, liveAnchor, 0.55))) {
            return fallbackEntry;
          }
        }
        const dynamicLive = Boolean(
          dynamicEntry && dynamicCount >= 2 && (isLiveSteamHistorySeries(dynamicEntry) || isLiveSteamHistorySource(activity?.history_source) || !dynamicSynthetic)
        );
        if (dynamicLive) {
          return dynamicEntry;
        }
        if (fallbackEntry && fallbackCount >= 2 && !fallbackSynthetic) {
          return fallbackEntry;
        }
        if (dynamicEntry && dynamicCount >= 2) {
          return dynamicEntry;
        }
        if (fallbackEntry && fallbackCount >= 2) {
          return fallbackEntry;
        }
        return dynamicEntry || fallbackEntry || null;
      }
      if (!isSteam) {
        const dynamicAnchor = seriesAnchorPrice(dynamicEntry);
        if (dynamicEntry && dynamicCount >= 2 && dynamicAnchor) {
          if (fallbackEntry && fallbackCount >= 2 && !seriesPriceNearReference(fallbackEntry, dynamicAnchor, 0.35)) {
            return dynamicEntry;
          }
        }
      }
      if (fallbackEntry && fallbackCount >= 3 && !fallbackSynthetic) {
        if (!dynamicEntry || dynamicSynthetic || fallbackCount > dynamicCount) {
          return fallbackEntry;
        }
      }
      if (dynamicEntry && dynamicCount >= 2 && !dynamicSynthetic) {
        return dynamicEntry;
      }
      if (fallbackEntry && fallbackCount >= 2 && !fallbackSynthetic) {
        return fallbackEntry;
      }
      if (dynamicEntry && dynamicCount >= 2) {
        return dynamicEntry;
      }
      if (fallbackEntry && fallbackCount >= 2) {
        return fallbackEntry;
      }
      return dynamicEntry || fallbackEntry || null;
    }
    function seriesPriceSpread(points) {
      const prices = normalizeAnalyticsSeriesPoints(points).map((point) => Number(point.price)).filter((price) => Number.isFinite(price) && price > 0);
      if (prices.length < 2) {
        return 0;
      }
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return max > 0 ? (max - min) / max : 0;
    }
    function shapeProviderSeriesFromSteam(steamPoints, anchorPrice) {
      const normalizedSteam = normalizeAnalyticsSeriesPoints(steamPoints);
      if (normalizedSteam.length < 2 || !Number.isFinite(anchorPrice) || anchorPrice <= 0) {
        return [];
      }
      const lastSteam = Number(normalizedSteam[normalizedSteam.length - 1]?.price || 0) || Number(normalizedSteam[0]?.price || 0);
      if (!Number.isFinite(lastSteam) || lastSteam <= 0) {
        return [];
      }
      const scale = anchorPrice / lastSteam;
      return normalizedSteam.map((point) => ({
        date: point.date,
        price: Number((Number(point.price) * scale).toFixed(Number(point.price) < 1 ? 4 : 2)),
        volume: Math.max(1, Number(point.volume || 1)),
        synthetic: true
      })).filter((point) => point.date && point.price > 0);
    }
    function backfillProviderSeriesFromSteam(steamPoints, providerPoints) {
      const steam = normalizeAnalyticsSeriesPoints(steamPoints);
      if (steam.length < 2) {
        return normalizeAnalyticsSeriesPoints(providerPoints);
      }
      const steamByDate = new Map(
        steam.map((point) => [String(point.date || "").slice(0, 10), point])
      );
      const realRaw = normalizeAnalyticsSeriesPoints(providerPoints).filter((point) => !point?.synthetic);
      const real = realRaw.filter((point) => {
        const key = String(point.date || "").slice(0, 10);
        const steamPoint = steamByDate.get(key) || [...steam].reverse().find((row) => String(row.date || "").slice(0, 10) <= key);
        const steamPrice = Number(steamPoint?.price || 0);
        if (!(steamPrice > 0)) return true;
        const ratio = Number(point.price) / steamPrice;
        return ratio >= 0.55 && ratio <= 1.55;
      });
      const provider = real.length >= 2 ? real : normalizeAnalyticsSeriesPoints(providerPoints).filter((point) => {
        const key = String(point.date || "").slice(0, 10);
        const steamPoint = steamByDate.get(key) || [...steam].reverse().find((row) => String(row.date || "").slice(0, 10) <= key);
        const steamPrice = Number(steamPoint?.price || 0);
        if (!(steamPrice > 0)) return Number(point.price) > 0;
        const ratio = Number(point.price) / steamPrice;
        return ratio >= 0.55 && ratio <= 1.55;
      });
      if (provider.length < 2) {
        const liveAnchor = positivePrice(realRaw[realRaw.length - 1]?.price) || positivePrice(steam[steam.length - 1]?.price) * 0.92 || 0;
        return liveAnchor > 0 ? shapeProviderSeriesFromSteam(steam, liveAnchor) : steam.map((point) => ({
          ...point,
          price: Number((Number(point.price) * 0.92).toFixed(Number(point.price) < 1 ? 4 : 2)),
          synthetic: true
        }));
      }
      const firstDate = String(provider[0]?.date || "").slice(0, 10);
      if (!firstDate) {
        return provider;
      }
      const steamStart = String(steam[0]?.date || "").slice(0, 10);
      if (steamStart && firstDate <= steamStart) {
        return densifyProviderOntoSteamDates(steam, provider);
      }
      const steamAtJoin = [...steam].reverse().find((point) => String(point.date || "").slice(0, 10) <= firstDate) || steam[0];
      const joinSteamPrice = Number(steamAtJoin?.price || 0);
      const joinProviderPrice = Number(provider[0]?.price || 0);
      if (!(joinSteamPrice > 0) || !(joinProviderPrice > 0)) {
        return densifyProviderOntoSteamDates(steam, provider);
      }
      const rawScale = joinProviderPrice / joinSteamPrice;
      const scale = Math.min(1.18, Math.max(0.78, rawScale));
      const prefix = steam.filter((point) => String(point.date || "").slice(0, 10) < firstDate).map((point) => {
        const price = Number(point.price) * scale;
        return {
          date: point.date,
          price: Number(price.toFixed(price < 1 ? 4 : 2)),
          volume: Math.max(1, Number(point.volume || 1)),
          synthetic: true
        };
      }).filter((point) => point.date && point.price > 0);
      const byDate = /* @__PURE__ */ new Map();
      prefix.forEach((point) => {
        byDate.set(String(point.date).slice(0, 10), point);
      });
      provider.forEach((point) => {
        byDate.set(String(point.date).slice(0, 10), {
          ...point,
          synthetic: false
        });
      });
      const merged = [...byDate.entries()].sort((left, right) => left[0].localeCompare(right[0])).map((entry) => entry[1]);
      return densifyProviderOntoSteamDates(steam, merged);
    }
    function densifyProviderOntoSteamDates(steamPoints, providerPoints) {
      const steam = normalizeAnalyticsSeriesPoints(steamPoints);
      const provider = normalizeAnalyticsSeriesPoints(providerPoints);
      if (steam.length < 2 || provider.length < 2) {
        return provider;
      }
      if (providerSeriesIsNearFlat(provider, steam)) {
        const anchor = positivePrice(provider[provider.length - 1]?.price) || positivePrice(provider[0]?.price) || 0;
        return anchor > 0 ? shapeProviderSeriesFromSteam(steam, anchor) : provider;
      }
      const providerByDate = new Map(
        provider.map((point) => [String(point.date || "").slice(0, 10), point])
      );
      let lastProvider = null;
      let steamAtLast = null;
      const densified = [];
      steam.forEach((steamPoint) => {
        const key = String(steamPoint.date || "").slice(0, 10);
        const hit = providerByDate.get(key);
        if (hit) {
          const hitPrice = Number(hit.price || 0);
          const lastPrice = Number(lastProvider?.price || 0);
          const steamThen2 = Number(steamAtLast?.price || 0);
          const steamNow2 = Number(steamPoint.price || 0);
          const priceDelta = lastPrice > 0 ? Math.abs(hitPrice - lastPrice) / Math.max(hitPrice, lastPrice) : 1;
          const steamDelta = steamThen2 > 0 ? Math.abs(steamNow2 - steamThen2) / steamThen2 : 0;
          if (lastProvider && steamAtLast && hitPrice > 0 && lastPrice > 0 && priceDelta < 0.015 && steamDelta > 0.035) {
            const ratio = Math.min(1.55, Math.max(0.55, steamNow2 / steamThen2));
            const price2 = lastPrice * ratio;
            const synthetic = {
              date: key,
              price: Number(price2.toFixed(price2 < 1 ? 4 : 2)),
              volume: Math.max(1, Number(lastProvider.volume || 1)),
              synthetic: true
            };
            lastProvider = synthetic;
            steamAtLast = steamPoint;
            densified.push(synthetic);
            return;
          }
          lastProvider = hit;
          steamAtLast = steamPoint;
          densified.push({
            ...hit,
            date: key,
            synthetic: Boolean(hit.synthetic)
          });
          return;
        }
        if (!lastProvider || !steamAtLast) {
          return;
        }
        const base = Number(lastProvider.price || 0);
        const steamThen = Number(steamAtLast.price || 0);
        const steamNow = Number(steamPoint.price || 0);
        let price = base;
        if (base > 0 && steamThen > 0 && steamNow > 0) {
          const ratio = Math.min(1.55, Math.max(0.55, steamNow / steamThen));
          price = base * ratio;
        }
        densified.push({
          date: key,
          price: Number(price.toFixed(price < 1 ? 4 : 2)),
          volume: Math.max(1, Number(lastProvider.volume || 1)),
          synthetic: true
        });
      });
      provider.forEach((point) => {
        const key = String(point.date || "").slice(0, 10);
        if (!densified.some((row) => String(row.date).slice(0, 10) === key)) {
          densified.push(point);
        }
      });
      return densified.sort((left, right) => String(left.date).localeCompare(String(right.date)));
    }
    function enrichProvidersWithSteamBackfill(providers, range = "ALL") {
      if (!Array.isArray(providers) || !providers.length) {
        return providers;
      }
      const steamProvider = providers.find((entry) => String(entry?.name || "").toLowerCase() === "steam");
      const steamPoints = normalizeAnalyticsSeriesPoints(steamProvider?.points || []);
      if (steamPoints.length < 2) {
        return providers;
      }
      return providers.map((provider) => {
        if (String(provider?.name || "").toLowerCase() === "steam") {
          return provider;
        }
        const points = provider?.points || [];
        if (!isLifetimeProviderRange(range) && !providerSeriesNeedsSteamShape(points, steamPoints)) {
          return provider;
        }
        const filled = backfillProviderSeriesFromSteam(steamPoints, points);
        if (filled.length < 2) {
          return provider;
        }
        return {
          ...provider,
          points: filled,
          current_price: positivePrice(filled[filled.length - 1]?.price) ?? provider.current_price
        };
      });
    }
    function providerSeriesDateCoverage(points, steamPoints) {
      const provider = normalizeAnalyticsSeriesPoints(points);
      const steam = normalizeAnalyticsSeriesPoints(steamPoints);
      if (provider.length < 2 || steam.length < 2) {
        return 0;
      }
      const steamDates = new Set(
        steam.map((point) => String(point.date || "").slice(0, 10)).filter(Boolean)
      );
      if (!steamDates.size) {
        return 0;
      }
      const providerDates = new Set(
        provider.map((point) => String(point.date || "").slice(0, 10)).filter(Boolean)
      );
      let hits = 0;
      providerDates.forEach((key) => {
        if (steamDates.has(key)) {
          hits += 1;
        }
      });
      if (hits === 0) {
        const steamStart = Date.parse(`${String(steam[0].date || "").slice(0, 10)}T00:00:00Z`);
        const steamEnd = Date.parse(`${String(steam[steam.length - 1].date || "").slice(0, 10)}T00:00:00Z`);
        if (Number.isFinite(steamStart) && Number.isFinite(steamEnd)) {
          providerDates.forEach((key) => {
            const time = Date.parse(`${key}T00:00:00Z`);
            if (Number.isFinite(time) && time >= steamStart && time <= steamEnd) {
              hits += 1;
            }
          });
        }
      }
      return Math.min(1, hits / steamDates.size);
    }
    function providerAxisLooksStraight(values, steamValues) {
      const prices = (Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
      if (prices.length < 2) {
        return true;
      }
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const spread = max > 0 ? (max - min) / max : 0;
      const steamPrices = (Array.isArray(steamValues) ? steamValues : []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
      const steamMin = steamPrices.length ? Math.min(...steamPrices) : 0;
      const steamMax = steamPrices.length ? Math.max(...steamPrices) : 0;
      const steamSpread = steamMax > 0 ? (steamMax - steamMin) / steamMax : 0;
      if (steamSpread > 0.05 && spread < Math.max(0.025, steamSpread * 0.35)) {
        return true;
      }
      const unique = new Set(prices.map((price) => price.toFixed(price < 1 ? 3 : 2)));
      if (steamSpread > 0.06 && unique.size <= 6) {
        return true;
      }
      let longestFlat = 1;
      let run = 1;
      for (let index = 1; index < prices.length; index += 1) {
        const prev = prices[index - 1];
        const curr = prices[index];
        const rel = Math.abs(curr - prev) / Math.max(prev, curr, 1e-9);
        if (rel <= 0.012) {
          run += 1;
          longestFlat = Math.max(longestFlat, run);
        } else {
          run = 1;
        }
      }
      if (steamSpread > 0.06 && longestFlat >= Math.max(8, Math.floor(prices.length * 0.18))) {
        return true;
      }
      const axisLen = Array.isArray(values) ? values.length : 0;
      const density = axisLen > 0 ? prices.length / axisLen : 0;
      if (density < 0.28 && unique.size <= 8) {
        return true;
      }
      return false;
    }
    function providerSeriesIsNearFlat(points, steamPoints) {
      const normalized = normalizeAnalyticsSeriesPoints(points);
      const steamNormalized = normalizeAnalyticsSeriesPoints(steamPoints);
      if (normalized.length < 2 || steamNormalized.length < 2) {
        return true;
      }
      const steamSpread = seriesPriceSpread(steamNormalized);
      const providerSpread = seriesPriceSpread(normalized);
      if (steamSpread > 0.05 && providerSpread < Math.max(0.025, steamSpread * 0.35)) {
        return true;
      }
      const uniquePrices = new Set(
        normalized.map((point) => Number(point.price).toFixed(Number(point.price) < 1 ? 3 : 2))
      );
      if (steamSpread > 0.06 && uniquePrices.size <= 6) {
        return true;
      }
      return false;
    }
    function reshapeProviderOntoSteam(steamPoints, providerPoints) {
      const steam = normalizeAnalyticsSeriesPoints(steamPoints);
      const provider = normalizeAnalyticsSeriesPoints(providerPoints);
      if (steam.length < 2) {
        return provider;
      }
      const realPoints = provider.filter((point) => !point?.synthetic);
      const anchor = positivePrice(realPoints[realPoints.length - 1]?.price) || positivePrice(provider[provider.length - 1]?.price) || positivePrice(provider[0]?.price) || 0;
      if (!anchor) {
        return provider;
      }
      if (providerSeriesIsNearFlat(provider, steam) || realPoints.length < 2) {
        return shapeProviderSeriesFromSteam(steam, anchor);
      }
      return backfillProviderSeriesFromSteam(steam, realPoints);
    }
    function providerSeriesNeedsSteamShape(points, steamPoints) {
      const normalized = normalizeAnalyticsSeriesPoints(points);
      const steamNormalized = normalizeAnalyticsSeriesPoints(steamPoints);
      const steamCount = steamNormalized.length;
      if (steamCount < 2) {
        return false;
      }
      if (normalized.length < 2) {
        return true;
      }
      if (providerSeriesIsNearFlat(normalized, steamNormalized)) {
        return true;
      }
      const coverage = providerSeriesDateCoverage(normalized, steamNormalized);
      const steamSpread = seriesPriceSpread(steamNormalized);
      const providerSpread = seriesPriceSpread(normalized);
      if (coverage < 0.08 || normalized.length < Math.max(4, Math.floor(steamCount * 0.06))) {
        return true;
      }
      if (coverage < 0.28 && steamSpread > 0.06 && providerSpread < Math.max(0.035, steamSpread * 0.32)) {
        return true;
      }
      if (steamSpread > 0.06 && providerSpread < Math.max(0.035, steamSpread * 0.32)) {
        return true;
      }
      const uniquePrices = new Set(
        normalized.map((point) => Number(point.price).toFixed(Number(point.price) < 1 ? 3 : 2))
      );
      if (steamSpread > 0.08 && uniquePrices.size <= 4) {
        return true;
      }
      const recentCount = Math.max(6, Math.floor(Math.min(normalized.length, steamNormalized.length) * 0.4));
      if (recentCount >= 6) {
        const recentProvider = normalized.slice(-recentCount);
        const recentSteam = steamNormalized.slice(-recentCount);
        const recentSteamSpread = seriesPriceSpread(recentSteam);
        const recentProviderSpread = seriesPriceSpread(recentProvider);
        const recentUnique = new Set(
          recentProvider.map((point) => Number(point.price).toFixed(Number(point.price) < 1 ? 3 : 2))
        );
        if (recentSteamSpread > 0.08 && (recentProviderSpread < Math.max(0.02, recentSteamSpread * 0.22) || recentUnique.size <= 3)) {
          return true;
        }
      }
      const realCount = normalized.filter((point) => !point?.synthetic).length;
      const hasRealHistory = normalized.length >= 8 && realCount >= Math.min(8, normalized.length);
      if (hasRealHistory) {
        return false;
      }
      const targetCount = Math.min(steamCount, Math.max(12, Math.floor(steamCount * 0.45)));
      if (normalized.length < targetCount) {
        return true;
      }
      if (steamSpread > 0 && providerSpread < steamSpread * 0.45) {
        return true;
      }
      return normalized.length < steamCount;
    }
    function isFlatMarketItem(itemName) {
      return itemTitleExcludesWearVariants(itemName);
    }
    function historyProviderAnchorPrice(provider) {
      const points = normalizeAnalyticsSeriesPoints(provider?.points || []);
      return positivePrice(provider?.current_price) || positivePrice(points[points.length - 1]?.price) || positivePrice(points[0]?.price) || 0;
    }
    function clampProviderPointsNearAnchor(points, anchor, tolerance = 0.35) {
      const normalized = normalizeAnalyticsSeriesPoints(points);
      const base = Number(anchor);
      if (!Number.isFinite(base) || base <= 0) {
        return normalized;
      }
      const low = base * (1 - tolerance);
      const high = base * (1 + tolerance);
      const clamped = normalized.filter((point) => point.price >= low && point.price <= high);
      if (clamped.length >= 2) {
        return clamped;
      }
      const fallback = normalized.slice(-Math.min(4, normalized.length));
      return fallback.length >= 2 ? fallback : normalized;
    }
    function shouldShapeProviderToSteam(points, steamPoints, range = "ALL") {
      const isLifetime = isLifetimeProviderRange(range);
      const normalized = normalizeAnalyticsSeriesPoints(points);
      const steamNormalized = normalizeAnalyticsSeriesPoints(steamPoints);
      if (isLifetime && normalized.length >= 2) {
        const providerStart = String(normalized[0]?.date || "");
        const steamStart = String(steamNormalized[0]?.date || "");
        if (providerStart && steamStart && providerStart < steamStart) {
          return false;
        }
        if (normalized.length > steamNormalized.length) {
          return false;
        }
      }
      if (!providerSeriesNeedsSteamShape(points, steamPoints)) {
        return false;
      }
      if (normalized.length > steamNormalized.length * 2) {
        return !isLifetime;
      }
      return true;
    }
    function prepareProvidersForHistoryChart(providers, itemName, range = "ALL") {
      if (!Array.isArray(providers) || !providers.length) {
        return providers;
      }
      const isLifetime = isLifetimeProviderRange(range);
      const flatItem = isFlatMarketItem(itemName);
      const steamProvider = providers.find((entry) => String(entry?.name || "").toLowerCase() === "steam");
      const steamPoints = normalizeAnalyticsSeriesPoints(steamProvider?.points || []);
      return providers.map((provider) => {
        let points = normalizeAnalyticsSeriesPoints(provider?.points || []);
        const anchor = historyProviderAnchorPrice(provider);
        const isSteam = String(provider?.name || "").toLowerCase() === "steam";
        if (!isSteam && flatItem && steamPoints.length >= 2 && anchor > 0 && shouldShapeProviderToSteam(points, steamPoints, range)) {
          const filled = isLifetime ? backfillProviderSeriesFromSteam(steamPoints, points) : shapeProviderSeriesFromSteam(steamPoints, anchor);
          if (filled.length >= 2) {
            points = filled;
          }
        }
        points = isLifetime ? points : clampProviderPointsNearAnchor(
          points,
          anchor,
          // Don't crush Steam (or wide rare-item books) on short ranges.
          isSteam ? 0.85 : flatItem ? 0.55 : 0.42
        );
        return {
          ...provider,
          points
        };
      }).filter((provider) => provider.points.length >= 2);
    }
    function ensureProvidersFromLiveQuotes(providers, liveQuotes, itemName, range = "ALL") {
      const list = Array.isArray(providers) ? providers.slice() : [];
      let steamProvider = list.find((entry) => String(entry?.name || "").toLowerCase() === "steam");
      let steamPoints = normalizeAnalyticsSeriesPoints(steamProvider?.points || []);
      const flatItem = isFlatMarketItem(itemName);
      if (steamPoints.length < 2) {
        const steamQuote = liveQuotes?.steam || null;
        const steamPrice = positivePrice(steamQuote?.price);
        if (steamPrice > 0) {
          const fallbackPoints = buildProviderQuotePoints(steamQuote, range, `${itemName}:steam`);
          if (fallbackPoints.length >= 2) {
            steamProvider = {
              name: "Steam",
              color: steamProvider?.color || marketColor("Steam"),
              current_price: steamPrice,
              points: fallbackPoints
            };
            steamPoints = fallbackPoints;
            const steamKey = "steam";
            const byTemp = new Map(list.map((entry) => [String(entry?.name || "").toLowerCase(), entry]));
            byTemp.set(steamKey, steamProvider);
            list.length = 0;
            list.push(...byTemp.values());
          }
        }
      }
      if (steamPoints.length < 2) {
        return list;
      }
      const steamRef = positivePrice(steamProvider?.current_price) || positivePrice(steamPoints[steamPoints.length - 1]?.price) || 0;
      const byName = new Map(
        list.map((entry) => [String(entry?.name || "").toLowerCase(), entry])
      );
      const sources = [
        ["skinport", "Skinport"],
        ["csfloat", "CSFloat"],
        ["white_market", "White.Market"],
        ["dmarket", "DMarket"],
        ["market_csgo", "Market.CSGO"],
        ["shadowpay", "ShadowPay"],
        ["waxpeer", "Waxpeer"],
        ["mannco", "Mannco.store"],
        ["haloskins", "HaloSkins"],
        ["rapidskins", "RapidSkins"]
      ];
      sources.forEach(([sourceId, label]) => {
        const key = label.toLowerCase();
        const rawQuote = liveQuotes?.[sourceId] || null;
        const listings = Math.max(0, Number(rawQuote?.listings || rawQuote?.quantity || 0) || 0);
        let quote = sanitizeMarketplaceQuote(rawQuote, steamRef, sourceId, itemName, "");
        if (!quote && flatItem && listings > 0) {
          const rawPrice = positivePrice(rawQuote?.price);
          if (rawPrice > 0 && steamRef > 0) {
            const ratio = rawPrice / steamRef;
            if (ratio >= 0.2 && ratio <= 4.5) {
              quote = {
                ...rawQuote,
                price: rawPrice
              };
            }
          }
        }
        const livePrice = positivePrice(quote?.price);
        if (!(livePrice > 0)) {
          return;
        }
        const existing = byName.get(key);
        const existingPoints = normalizeAnalyticsSeriesPoints(existing?.points || []);
        const existingAnchor = historyProviderAnchorPrice(existing);
        const needsReplace = !existing || existingPoints.length < 2 || existingAnchor > 0 && Math.abs(existingAnchor - livePrice) / Math.max(livePrice, 0.01) > 0.35;
        if (!needsReplace) {
          return;
        }
        const shaped = shapeProviderSeriesFromSteam(steamPoints, livePrice);
        if (shaped.length < 2) {
          return;
        }
        byName.set(key, {
          name: label,
          color: existing?.color || marketColor(label),
          current_price: livePrice,
          points: shaped
        });
      });
      return prepareProvidersForHistoryChart(
        Array.from(byName.values()),
        itemName,
        range
      );
    }
    function collectProviderChartValues(providers) {
      return (Array.isArray(providers) ? providers : []).flatMap((provider) => Array.isArray(provider?.values) ? provider.values : []).filter((value) => Number.isFinite(value) && value > 0);
    }
    function compressCrowdedProviderSeries(providers) {
      if (!Array.isArray(providers) || providers.length < 2) {
        return providers;
      }
      const axisLen = Math.max(0, ...providers.map((provider) => Array.isArray(provider?.values) ? provider.values.length : 0));
      if (axisLen < 2) {
        return providers;
      }
      const KEEP_DELTA = 0.3;
      const MICRO_FRAC = 45e-4;
      const steamProvider = providers.find((provider) => String(provider?.name || "").toLowerCase() === "steam");
      const steamValues = Array.isArray(steamProvider?.values) ? steamProvider.values : null;
      const means = providers.map((provider) => {
        const vals = (Array.isArray(provider?.values) ? provider.values : []).filter((value) => Number.isFinite(value) && value > 0);
        if (!vals.length) return 0;
        return vals.reduce((sum, value) => sum + value, 0) / vals.length;
      });
      const order = means.map((mean, index) => ({ mean, index })).sort((left, right) => left.mean - right.mean);
      const rankByIndex = new Array(providers.length).fill(0);
      order.forEach((row, rank) => {
        rankByIndex[row.index] = rank;
      });
      const midRank = (providers.length - 1) / 2;
      return providers.map((provider, providerIndex) => {
        const values = Array.isArray(provider?.values) ? provider.values.slice() : [];
        const trueValues = values.slice();
        const isSteam = String(provider?.name || "").toLowerCase() === "steam";
        const next = values.map((raw, index) => {
          if (!(Number.isFinite(raw) && raw > 0)) {
            return raw;
          }
          let reference = null;
          const steamAtIndex = steamValues ? Number(steamValues[index]) : NaN;
          if (Number.isFinite(steamAtIndex) && steamAtIndex > 0) {
            reference = steamAtIndex;
          } else {
            const peers = providers.map((entry) => Number(entry?.values?.[index])).filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
            if (peers.length) {
              reference = peers[Math.floor((peers.length - 1) / 2)];
            }
          }
          if (!(reference > 0)) {
            return raw;
          }
          let drawn = isSteam ? raw : reference + (raw - reference) * KEEP_DELTA;
          const lane = reference * MICRO_FRAC * (rankByIndex[providerIndex] - midRank);
          drawn = Math.max(1e-4, drawn + lane);
          return Number(drawn.toFixed(drawn < 1 ? 4 : 2));
        });
        return {
          ...provider,
          values: next,
          trueValues
        };
      });
    }
    function alignProviderSeriesToSteamShape(mergedSeries) {
      if (!mergedSeries || typeof mergedSeries !== "object") {
        return mergedSeries || {};
      }
      const steamPoints = normalizeAnalyticsSeriesPoints(mergedSeries?.steam?.points || []);
      if (steamPoints.length < 2) {
        return mergedSeries;
      }
      const nextSeries = { ...mergedSeries };
      ["skinport", "csfloat", "white_market", "dmarket", "market_csgo", "shadowpay", "waxpeer", "mannco", "haloskins", "rapidskins"].forEach((sourceId) => {
        const entry = mergedSeries[sourceId];
        if (!entry) {
          return;
        }
        const points = entry.points || [];
        const normalized = normalizeAnalyticsSeriesPoints(points);
        if (normalized.length < 1 && !positivePrice(entry.current_price)) {
          return;
        }
        const filled = backfillProviderSeriesFromSteam(
          steamPoints,
          normalized.length >= 2 ? normalized : [{
            date: steamPoints[steamPoints.length - 1]?.date,
            price: positivePrice(entry.current_price) || 0,
            volume: 1
          }]
        );
        if (filled.length >= 2) {
          nextSeries[sourceId] = {
            ...entry,
            points: filled,
            point_count: filled.length,
            current_price: filled[filled.length - 1]?.price ?? entry.current_price
          };
        }
      });
      return nextSeries;
    }
    function enrichRemoteProvidersFromSteam(providers) {
      if (!Array.isArray(providers) || !providers.length) {
        return providers;
      }
      const steamProvider = providers.find((entry) => String(entry?.name || "").toLowerCase() === "steam");
      const steamPoints = normalizeAnalyticsSeriesPoints(steamProvider?.points || []);
      if (steamPoints.length < 2) {
        return providers;
      }
      return providers.map((provider) => {
        if (String(provider?.name || "").toLowerCase() === "steam") {
          return provider;
        }
        const points = provider?.points || [];
        if (!providerSeriesNeedsSteamShape(points, steamPoints)) {
          return provider;
        }
        const normalized = normalizeAnalyticsSeriesPoints(points);
        const realPoints = normalized.filter((point) => !point?.synthetic);
        const anchor = positivePrice(realPoints[realPoints.length - 1]?.price) || positivePrice(normalized[normalized.length - 1]?.price) || positivePrice(normalized[0]?.price) || 0;
        if (!anchor) {
          return provider;
        }
        const reshaped = reshapeProviderOntoSteam(steamPoints, normalized.length >= 2 ? normalized : realPoints);
        if (reshaped.length < 2) {
          return provider;
        }
        return {
          ...provider,
          points: reshaped,
          current_price: positivePrice(reshaped[reshaped.length - 1]?.price) ?? provider.current_price
        };
      });
    }
    function expandChartBoundsToFitValues(bounds, values, paddingRatio = 0.1) {
      const cleaned = (Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
      if (!cleaned.length) {
        return bounds;
      }
      const actualMin = Math.min(...cleaned);
      const actualMax = Math.max(...cleaned);
      const span = Math.max(actualMax - actualMin, actualMax * 0.02, 0.01);
      const pad = Math.max(span * paddingRatio, actualMax * 0.035, 0.02);
      const min = Number(bounds?.min ?? 0);
      const max = Number(bounds?.max ?? actualMax);
      return {
        min: Math.min(min, actualMin - pad),
        max: Math.max(max, actualMax + pad)
      };
    }
    function computeProviderChartBounds(prices, rangeLabel) {
      const cleaned = prices.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
      if (!cleaned.length) {
        return { min: 0, max: 1 };
      }
      if (cleaned.length === 1) {
        const value = cleaned[0];
        const pad = Math.max(value * 0.18, 0.01);
        return { min: Math.max(0, value - pad), max: value + pad };
      }
      const pick = (percentile) => {
        const index = Math.min(
          cleaned.length - 1,
          Math.max(0, Math.floor((cleaned.length - 1) * percentile))
        );
        return cleaned[index];
      };
      const median = pick(0.5);
      const actualMax = cleaned[cleaned.length - 1];
      const iqrLow = pick(0.25);
      const iqrHigh = pick(0.75);
      const iqr = Math.max(iqrHigh - iqrLow, median * 0.05, 0.01);
      let low = Math.max(pick(0.05), iqrLow - iqr * 0.2);
      const clusterFloor = Math.max(0, median - iqr * 1.55);
      low = Math.max(low, clusterFloor);
      let high = pick(0.94);
      const rangeKey = String(rangeLabel || "").toUpperCase();
      const isMaxRange = isLifetimeProviderRange(rangeKey);
      const isLongRange = isMaxRange || rangeKey === "1Y" || rangeKey === "180D";
      const hasSpike = median > 0 && actualMax / median > 2.8;
      if (isLongRange || hasSpike) {
        const cap = Math.max(iqrHigh + iqr * 0.85, median + iqr * 2.6);
        high = Math.min(high, cap);
      } else {
        high = Math.min(actualMax, high + iqr * 0.35);
      }
      const span = Math.max(high - low, high * 0.06, median * 0.04, 0.01);
      const topPad = span * (isMaxRange ? 0.18 : 0.12);
      const bottomPad = span * 0.05;
      let max = isLongRange && hasSpike ? high + topPad : Math.max(high + topPad, actualMax);
      const headroom = Math.max(max * (isMaxRange ? 0.05 : 0.03), span * 0.08, 0.02);
      const expanded = expandChartBoundsToFitValues({
        min: Math.max(0, low - bottomPad),
        max: max + headroom
      }, cleaned, isMaxRange ? 0.12 : 0.1);
      return {
        min: Math.max(0, Number(expanded?.min ?? 0)),
        max: Number(expanded?.max ?? 1)
      };
    }
    function computeChartPriceBounds(prices) {
      const cleaned = prices.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
      if (!cleaned.length) {
        return { min: 0, max: 1 };
      }
      if (cleaned.length === 1) {
        const value = cleaned[0];
        const pad2 = Math.max(value * 0.12, 0.01);
        return { min: Math.max(0, value - pad2), max: value + pad2 };
      }
      const pick = (percentile) => {
        const index = Math.min(
          cleaned.length - 1,
          Math.max(0, Math.floor((cleaned.length - 1) * percentile))
        );
        return cleaned[index];
      };
      const median = pick(0.5);
      let low = pick(0.06);
      let high = pick(0.94);
      if (median > 0 && high / median > 4) {
        const iqrLow = pick(0.25);
        const iqrHigh = pick(0.75);
        const iqr = Math.max(iqrHigh - iqrLow, median * 0.04, 0.01);
        high = Math.min(high, median + iqr * 3);
        low = Math.max(low, Math.max(0, median - iqr * 3));
      }
      const range = Math.max(high - low, high * 0.02, median * 0.04, 0.01);
      const pad = range * 0.16;
      return expandChartBoundsToFitValues({
        min: Math.max(0, low - pad),
        max: high + pad * 1.15
      }, cleaned, 0.1);
    }
    function shouldChartAnchorZero(bounds) {
      const min = Number(bounds?.min || 0);
      const max = Number(bounds?.max || 0);
      if (!Number.isFinite(max) || max <= 0) {
        return true;
      }
      if (max <= 2.5) {
        return true;
      }
      if (min <= Math.max(0.05, max * 0.05)) {
        return true;
      }
      return false;
    }
    function dedupeChartPointsByDate(points) {
      const byDate = {};
      normalizeAnalyticsSeriesPoints(points).forEach((point) => {
        const date = String(point.date).slice(0, 10);
        if (!date) {
          return;
        }
        if (!byDate[date]) {
          byDate[date] = { date, prices: [], volume: 0 };
        }
        byDate[date].prices.push(Number(point.price));
        byDate[date].volume += Math.max(0, Number(point.volume || 0));
      });
      return Object.values(byDate).map((entry) => {
        const prices = entry.prices.filter((value) => value > 0).sort((left, right) => left - right);
        if (!prices.length) {
          return null;
        }
        const mid = Math.floor(prices.length / 2);
        const price = prices.length % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
        return {
          date: entry.date,
          price: formatChartPriceValue(price),
          volume: Math.max(1, Number(entry.volume || 1))
        };
      }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
    }
    function bucketChartPointsForDisplay(points, maxPoints = 180) {
      const normalized = dedupeChartPointsByDate(points);
      if (normalized.length <= maxPoints) {
        return normalized;
      }
      const bucketSize = Math.ceil(normalized.length / maxPoints);
      const buckets = [];
      for (let index = 0; index < normalized.length; index += bucketSize) {
        const slice = normalized.slice(index, index + bucketSize);
        const prices = slice.map((point) => point.price).sort((left, right) => left - right);
        const mid = Math.floor(prices.length / 2);
        const price = prices.length % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
        const volume = slice.reduce((sum, point) => sum + Number(point.volume || 0), 0);
        buckets.push({
          date: slice[slice.length - 1].date,
          price: formatChartPriceValue(price),
          volume: Math.max(1, volume)
        });
      }
      if (buckets.length && normalized.length) {
        buckets[0] = { ...buckets[0], date: normalized[0].date };
      }
      return buckets;
    }
    function rollingMedianChartPoints(points, windowSize = 3) {
      if (points.length <= windowSize) {
        return points;
      }
      return points.map((point, index) => {
        const start = Math.max(0, index - Math.floor(windowSize / 2));
        const end = Math.min(points.length, start + windowSize);
        const slice = points.slice(start, end).map((entry) => entry.price).sort((left, right) => left - right);
        const mid = Math.floor(slice.length / 2);
        const price = slice.length % 2 === 1 ? slice[mid] : (slice[mid - 1] + slice[mid]) / 2;
        return {
          ...point,
          price: Number(price.toFixed(2))
        };
      });
    }
    function formatChartPriceValue(price) {
      const value = Number(price);
      if (!Number.isFinite(value) || value <= 0) {
        return 0;
      }
      const decimals = value < 1 ? 4 : value < 10 ? 3 : 2;
      return Number(value.toFixed(decimals));
    }
    function formatSteamAxisPrice(price) {
      const value = Number(price);
      if (!Number.isFinite(value)) return "";
      let text;
      if (value >= 1e4) text = `${PRICE_SYMBOL}${(value / 1e3).toFixed(0)}k`;
      else if (value >= 1e3) text = `${PRICE_SYMBOL}${(value / 1e3).toFixed(1)}k`;
      else {
        const decimals = value < 1 ? 3 : 2;
        text = `${PRICE_SYMBOL}${value.toFixed(decimals)}`;
      }
      return text;
    }
    const CHART_MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const CHART_WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    function padChartTimePart(value) {
      return String(Math.max(0, Number(value) || 0)).padStart(2, "0");
    }
    function isoWeekNumber(year, month, day) {
      const date = new Date(Date.UTC(year, month - 1, day));
      const utcDay = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - utcDay);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      return Math.ceil(((date - yearStart) / 864e5 + 1) / 7);
    }
    function parseChartTickTime(time) {
      if (time == null) return null;
      if (typeof time === "object" && Number.isFinite(Number(time.year))) {
        const year = Number(time.year);
        const month = Math.max(1, Math.min(12, Number(time.month) || 1));
        const day = Math.max(1, Number(time.day) || 1);
        const hour = Number.isFinite(Number(time.hour)) ? Number(time.hour) : null;
        const minute = Number.isFinite(Number(time.minute)) ? Number(time.minute) : null;
        return { year, month, day, hour, minute, hasTime: hour != null };
      }
      if (typeof time === "number" && Number.isFinite(time)) {
        const date = new Date(time > 1e12 ? time : time * 1e3);
        if (Number.isNaN(date.getTime())) return null;
        return {
          year: date.getUTCFullYear(),
          month: date.getUTCMonth() + 1,
          day: date.getUTCDate(),
          hour: date.getUTCHours(),
          minute: date.getUTCMinutes(),
          hasTime: true
        };
      }
      const raw = String(time);
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
      if (match) {
        const hour = match[4] != null ? Number(match[4]) : null;
        const minute = match[5] != null ? Number(match[5]) : null;
        return {
          year: Number(match[1]),
          month: Number(match[2]),
          day: Number(match[3]),
          hour,
          minute,
          hasTime: hour != null
        };
      }
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return null;
      return {
        year: parsed.getUTCFullYear(),
        month: parsed.getUTCMonth() + 1,
        day: parsed.getUTCDate(),
        hour: parsed.getUTCHours(),
        minute: parsed.getUTCMinutes(),
        hasTime: /[T\s]\d{2}:\d{2}/.test(raw)
      };
    }
    function formatChartDayMonth(date) {
      const month = CHART_MONTH_SHORT[date.month - 1] || "";
      return month ? `${date.day} ${month}` : String(date.day);
    }
    function formatChartTimeTick(time, tickMarkType) {
      const date = parseChartTickTime(time);
      if (!date) return " ";
      const type = Number(tickMarkType);
      if (type === 0) return String(date.year);
      if (type === 1) return CHART_MONTH_SHORT[date.month - 1] || "";
      if (type === 2) return formatChartDayMonth(date);
      if (type === 3 && date.hasTime) {
        return `${padChartTimePart(date.hour)}:${padChartTimePart(date.minute)}`;
      }
      return formatChartDayMonth(date);
    }
    function formatChartCrosshairDate(time, range = "") {
      const date = parseChartTickTime(time);
      if (!date) return "";
      return formatChartDayMonth(date);
    }
    function lightweightChartAxisAppearance(fullscreen) {
      const fs = Boolean(fullscreen);
      return {
        textColor: fs ? "#eef3f9" : "#c5d4e8",
        fontSize: fs ? 13 : 12,
        fontFamily: "'Motiva Sans', 'Segoe UI', Inter, Arial, sans-serif",
        timeBorder: fs ? "rgba(226, 232, 240, 0.18)" : "rgba(255,255,255,0.08)",
        priceBorder: fs ? "rgba(148, 163, 184, 0.4)" : "rgba(51, 65, 85, 0.28)"
      };
    }
    function lightweightChartAxisOptions(fullscreen) {
      const axis = lightweightChartAxisAppearance(fullscreen);
      const fs = Boolean(fullscreen);
      return {
        layout: {
          textColor: axis.textColor,
          fontSize: axis.fontSize,
          fontFamily: axis.fontFamily
        },
        leftPriceScale: {
          visible: true,
          borderColor: axis.priceBorder,
          textColor: axis.textColor,
          entireTextOnly: false,
          drawTicks: true,
          alignLabels: true,
          drawLabels: true,
          minimumWidth: fs ? 80 : 72
        },
        timeScale: {
          visible: true,
          borderColor: axis.timeBorder,
          timeVisible: false,
          secondsVisible: false,
          tickMarkFormatter: formatChartTimeTick
        },
        crosshair: {
          vertLine: {
            labelVisible: false,
            labelBackgroundColor: fullscreen ? "#2f3a52" : "#1e2330"
          },
          horzLine: {
            labelVisible: true,
            labelBackgroundColor: fullscreen ? "#2f3a52" : "#1e2330"
          }
        }
      };
    }
    function chartTimeKey(time) {
      if (time && typeof time === "object" && Number.isFinite(Number(time.year))) {
        const month = String(time.month).padStart(2, "0");
        const day = String(time.day).padStart(2, "0");
        return `${time.year}-${month}-${day}`;
      }
      return parseChartPointDateKey(time);
    }
    function findLightweightTimeAxisParts(container) {
      const table = container?.querySelector("table") || null;
      if (!table?.rows?.length) {
        return { table: null, plotCell: null, timeAxisCell: null };
      }
      const plotRow = table.rows[0];
      const timeRow = table.rows[table.rows.length - 1];
      const plotCell = plotRow?.cells?.[1] || plotRow?.cells?.[plotRow.cells.length - 1] || null;
      const timeAxisCell = timeRow && timeRow !== plotRow ? timeRow.cells?.[1] || timeRow.cells?.[timeRow.cells.length - 1] || null : null;
      return { table, plotCell, timeAxisCell };
    }
    function formatSteamVolumeBarColor(volume, peakVolume) {
      const value = Math.max(0, Number(volume || 0));
      const peak = Math.max(1, Number(peakVolume || 1));
      const intensity = 0.16 + value / peak * 0.44;
      return `rgba(74, 144, 226, ${intensity.toFixed(3)})`;
    }
    function isLiveSteamHistorySource(source) {
      const value = String(source || "").toLowerCase();
      return value === "steam_pricehistory_api" || value === "steam_pricehistory" || value === "sql";
    }
    function isLiveSteamHistorySeries(entry) {
      if (!entry) return false;
      if (entry.live_history) return true;
      return isLiveSteamHistorySource(entry.history_source);
    }
    function seriesAnchorPrice(entry) {
      const points = normalizeAnalyticsSeriesPoints(entry?.points || []);
      if (!points.length) return null;
      return positivePrice(entry?.current_price) ?? positivePrice(points[points.length - 1]?.price) ?? positivePrice(chartSeriesMedian(points.map((point) => point.price)));
    }
    function seriesPriceNearReference(entry, referencePrice, tolerance = 0.42) {
      const anchor = seriesAnchorPrice(entry);
      const reference = positivePrice(referencePrice);
      if (!anchor || !reference) return true;
      const ratio = anchor / reference;
      return ratio >= 1 - tolerance && ratio <= 1 + tolerance;
    }
    function filterChartPointsToPresent(points) {
      const todayKey = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const normalized = normalizeAnalyticsSeriesPoints(points);
      const filtered = normalized.filter((point) => String(point.date).slice(0, 10) <= todayKey);
      return filtered.length >= 2 ? filtered : normalized;
    }
    function resolveSteamChartBounds(prices, range = "ALL") {
      const cleaned = prices.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
      if (!cleaned.length) {
        return { min: 0, max: 1, displayMax: 1 };
      }
      const rangeKey = String(range || "ALL").toUpperCase();
      const bounds = computeProviderChartBounds(cleaned, rangeKey);
      const tailCount = Math.min(24, Math.max(6, Math.floor(cleaned.length * 0.06)));
      const tailMax = Math.max(...cleaned.slice(-tailCount));
      const max = Math.max(bounds.max, tailMax * 1.06);
      const headroom = Math.max(max * 0.04, (max - bounds.min) * 0.07, 0.04);
      return expandChartBoundsToFitValues({
        min: bounds.min,
        max,
        displayMax: max + headroom
      }, cleaned, rangeKey === "ALL" || rangeKey === "MAX" ? 0.12 : 0.1);
    }
    function buildSteamPriceAutoscaleProvider(bounds, values = []) {
      const anchorZero = shouldChartAnchorZero(bounds);
      let minValue = anchorZero ? 0 : bounds.min;
      let maxValue = bounds.displayMax;
      const cleaned = (Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
      if (cleaned.length) {
        const fitted = expandChartBoundsToFitValues(
          { min: minValue, max: maxValue },
          cleaned,
          0.1
        );
        minValue = anchorZero ? 0 : fitted.min;
        maxValue = fitted.max;
      }
      return () => ({
        priceRange: {
          minValue,
          maxValue
        }
      });
    }
    function toSteamChartTime(dateValue) {
      return parseChartPointDateKey(dateValue);
    }
    function prepareSteamChartPoints(points, range = "ALL", referencePrice = 0) {
      const normalizedRange = String(range || "ALL").toUpperCase();
      const isLifetime = normalizedRange === "ALL" || normalizedRange === "MAX";
      const maxPoints = isLifetime ? 3500 : 240;
      const present = filterChartPointsToPresent(points);
      const deduped = dedupeChartPointsByDate(present);
      const source = isLifetime ? deduped : (() => {
        const filtered = filterChartSeriesOutliers(deduped, referencePrice, false);
        return filtered.length >= 2 ? filtered : deduped;
      })();
      if (source.length <= maxPoints) {
        return source;
      }
      return bucketChartPointsForDisplay(source, maxPoints);
    }
    function prepareChartDisplaySeries(points, referencePrice = 0, marketplace = false) {
      const normalized = normalizeAnalyticsSeriesPoints(points);
      const filtered = filterChartSeriesOutliers(normalized, referencePrice, marketplace);
      const display = filtered.length >= 2 ? filtered : normalized;
      return {
        points: display,
        priceBounds: computeChartPriceBounds(display.map((point) => point.price))
      };
    }
    function buildWhiteMarketItemUrl(itemName, wear) {
      const fullName = buildMarketplaceSearchName(itemName, wear);
      return `https://white.market/item?appId=730&nameHash=${encodeURIComponent(fullName)}`;
    }
    function shadowpayWearFloatRange(wear) {
      const cleanWear = String(wear || "").trim();
      switch (cleanWear) {
        case "Factory New":
          return [0, 0.07];
        case "Minimal Wear":
          return [0.07, 0.15];
        case "Field-Tested":
          return [0.15, 0.38];
        case "Well-Worn":
          return [0.38, 0.45];
        case "Battle-Scarred":
          return [0.45, 1];
        default:
          return null;
      }
    }
    function buildShadowPayItemUrl(itemName, wear = "") {
      const rawName = String(itemName || "").trim();
      const wearFromName = rawName.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i)?.[1] || "";
      const cleanWear = String(wear || wearFromName || "").trim();
      const baseName = rawName.replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, "").trim();
      const isStatTrak = /^StatTrak™\s+/i.test(baseName) || /^StatTrak\s+/i.test(baseName);
      const searchName = baseName.replace(/^StatTrak™\s+/i, "").replace(/^StatTrak\s+/i, "").trim() || baseName;
      const params = new URLSearchParams({
        price_from: "0",
        price_to: "100000",
        is_stattrak: isStatTrak ? "1" : "",
        hold_days: "",
        search: searchName
      });
      const floatRange = shadowpayWearFloatRange(cleanWear);
      if (floatRange) {
        params.set("float_from", String(floatRange[0]));
        params.set("float_to", String(floatRange[1]));
      }
      return `https://shadowpay.com/csgo-items?${params.toString()}`;
    }
    function buildMarketplaceSearchName(itemName, wear) {
      const cleanName = String(itemName || "").trim();
      const cleanWear = String(wear || "").trim();
      return cleanWear ? `${cleanName} (${cleanWear})` : cleanName;
    }
    function marketplaceUrlMatchesSource(sourceId, url) {
      const normalizedSource = String(sourceId || "").toLowerCase();
      const rawUrl = String(url || "").trim();
      if (!rawUrl) return false;
      try {
        const parsed = new URL(rawUrl, window.location.origin);
        const host = String(parsed.hostname || "").toLowerCase();
        if (normalizedSource === "steam") return host.includes("steamcommunity.com");
        if (normalizedSource === "skinport") return host.includes("skinport.com");
        if (normalizedSource === "csfloat") return host.includes("csfloat.com");
        if (normalizedSource === "white_market") return host.includes("white.market");
        if (normalizedSource === "dmarket") return host.includes("dmarket.com");
        if (normalizedSource === "market_csgo") return host.includes("market.csgo.com");
        if (normalizedSource === "shadowpay") return host.includes("shadowpay.com");
        if (normalizedSource === "waxpeer") return host.includes("waxpeer.com");
        if (normalizedSource === "mannco") return host.includes("mannco.store");
        if (normalizedSource === "haloskins") return host.includes("haloskins.com");
        if (normalizedSource === "rapidskins") return host.includes("rapidskins.com");
        return true;
      } catch (_error) {
        return false;
      }
    }
    function shadowpayUrlIncludesWear(url, wear) {
      const cleanWear = String(wear || "").trim();
      if (!cleanWear) return true;
      try {
        const parsed = new URL(String(url || ""), "https://shadowpay.com");
        const floatFrom = Number(parsed.searchParams.get("float_from"));
        const floatTo = Number(parsed.searchParams.get("float_to"));
        const expected = shadowpayWearFloatRange(cleanWear);
        if (!expected) return true;
        return Number.isFinite(floatFrom) && Number.isFinite(floatTo) && Math.abs(floatFrom - expected[0]) < 1e-3 && Math.abs(floatTo - expected[1]) < 1e-3;
      } catch (_error) {
        return false;
      }
    }
    function buildSkinportItemUrl(itemName, wear = "") {
      const fullName = buildMarketplaceSearchName(itemName, wear);
      const slug = String(fullName || "").toLowerCase().replace(/[★☆™©®]/g, "").replace(/[|/_\\,.()[\]{}-]+/g, " ").trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]+/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
      if (slug) {
        return `https://skinport.com/item/${slug}`;
      }
      return `https://skinport.com/market/730?search=${encodeURIComponent(fullName)}`;
    }
    function buildMarketplaceFallbackUrl(sourceId, itemName, wear) {
      const fullName = buildMarketplaceSearchName(itemName, wear);
      if (sourceId === "skinport") {
        return buildSkinportItemUrl(itemName, wear);
      }
      if (sourceId === "csfloat") {
        return `https://csfloat.com/search?market_hash_name=${encodeURIComponent(fullName)}`;
      }
      if (sourceId === "white_market") {
        return buildWhiteMarketItemUrl(itemName, wear);
      }
      if (sourceId === "dmarket") {
        return `https://dmarket.com/ingame-items/item-list/csgo-skins?title=${encodeURIComponent(fullName)}`;
      }
      if (sourceId === "market_csgo") {
        return `https://market.csgo.com/en/?search=${encodeURIComponent(fullName)}`;
      }
      if (sourceId === "shadowpay") {
        return buildShadowPayItemUrl(itemName, wear);
      }
      if (sourceId === "waxpeer") {
        return `https://waxpeer.com/?search=${encodeURIComponent(fullName)}`;
      }
      if (sourceId === "mannco") {
        return `https://mannco.store/?search=${encodeURIComponent(fullName)}`;
      }
      if (sourceId === "haloskins") {
        return `https://www.haloskins.com/market?keyword=${encodeURIComponent(fullName)}`;
      }
      if (sourceId === "rapidskins") {
        return `https://www.rapidskins.com/buy?marketHashNames=${encodeURIComponent(fullName)}`;
      }
      return buildWearMarketUrl(itemName, wear);
    }
    function buildMarketplaceSearchUrl(marketplaceName, itemName, wear) {
      const canonical = canonicalMarketName(marketplaceName);
      const sourceId = {
        Steam: "steam",
        Skinport: "skinport",
        CSFloat: "csfloat",
        "White.Market": "white_market",
        DMarket: "dmarket",
        "Market.CSGO": "market_csgo",
        ShadowPay: "shadowpay",
        Waxpeer: "waxpeer",
        "Mannco.store": "mannco",
        HaloSkins: "haloskins",
        RapidSkins: "rapidskins"
      }[canonical];
      if (sourceId) {
        return buildMarketplaceFallbackUrl(sourceId, itemName, wear);
      }
      const fullName = buildMarketplaceSearchName(itemName, wear);
      const encoded = encodeURIComponent(fullName);
      switch (canonical) {
        case "Buff.163":
          return `https://buff.163.com/goods/730#tab=selling&search=${encoded}`;
        case "CS.Money":
          return `https://cs.money/market/buy/?search=${encoded}`;
        case "YouPin898":
          return `https://www.youpin898.com/search?keyword=${encoded}`;
        case "UUSkins":
          return `https://www.uuskins.com/market?search=${encoded}`;
        case "SkinSwap CN":
          return `https://skinswap.com/zh/market?search=${encoded}`;
        case "Ecosteam":
          return `https://www.ecosteam.cn/market?search=${encoded}`;
        default:
          return buildWearMarketUrl(itemName, wear);
      }
    }
    function marketplaceListingFeePct(marketplaceKey) {
      const key = String(marketplaceKey || "").trim();
      if (!key) return 0;
      const listing = LISTING_FALLBACKS[key] || LISTING_FALLBACKS[canonicalMarketName(key)];
      const fromListing = Number(listing?.fee_pct ?? NaN);
      if (Number.isFinite(fromListing) && fromListing >= 0) {
        return fromListing;
      }
      const known = {
        steam: 15,
        "steam market": 15,
        skinport: 1,
        csfloat: 2.5,
        "white.market": 4,
        white_market: 4,
        dmarket: 2,
        "market.csgo": 5,
        market_csgo: 5,
        shadowpay: 2,
        waxpeer: 2,
        "mannco.store": 0,
        mannco: 0,
        haloskins: 3,
        "rapidskins": 0
      };
      const normalized = key.toLowerCase().replace(/[\s_-]+/g, (ch) => ch === "." ? "." : "_");
      const compact = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const byNormalized = known[normalized] ?? known[key.toLowerCase()];
      if (Number.isFinite(byNormalized)) return byNormalized;
      if (compact === "dmarket") return 2;
      if (compact === "whitemarket") return 4;
      if (compact === "marketcsgo") return 5;
      return 0;
    }
    function marketplaceTableImage(marketplaceName) {
      const meta = getMarketplaceMeta(marketplaceName);
      return meta?.image || getMarketplaceMeta(canonicalMarketName(marketplaceName))?.image || "";
    }
    function getProviderChartTooltipEl(chart) {
      const parent = chart.canvas.parentNode;
      if (!parent) return null;
      let tooltipEl = parent.querySelector(".tv-prov-chart-tooltip");
      if (!tooltipEl) {
        tooltipEl = document.createElement("div");
        tooltipEl.className = "tv-prov-chart-tooltip";
        parent.appendChild(tooltipEl);
      }
      return tooltipEl;
    }
    function externalProviderChartTooltip(context) {
      const { chart, tooltip } = context;
      const tooltipEl = getProviderChartTooltipEl(chart);
      if (!tooltipEl) return;
      if (!tooltip || tooltip.opacity === 0) {
        tooltipEl.style.opacity = "0";
        tooltipEl.style.pointerEvents = "none";
        return;
      }
      const title = tooltip.title?.[0] || "";
      const ranked = (tooltip.dataPoints || []).filter((item) => Number.isFinite(item.parsed?.y) && item.parsed.y > 0).map((item) => {
        const name = String(item.dataset.label || "");
        const trueValues = item.dataset.trueValues;
        const trueValue = Array.isArray(trueValues) ? Number(trueValues[item.dataIndex]) : NaN;
        const value = Number.isFinite(trueValue) && trueValue > 0 ? trueValue : Number(item.parsed.y);
        return { name, value };
      }).sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
      const rows = ranked.map((entry, index) => {
        const image = marketplaceTableImage(entry.name);
        const icon = image ? `<img class="tv-prov-tooltip-icon" src="${image}" alt="" />` : `<span class="tv-prov-tooltip-fallback" style="background:${marketColor(entry.name)}"></span>`;
        return `<div class="tv-prov-tooltip-row"><span class="tv-prov-tooltip-rank">${index + 1}</span>${icon}<span class="tv-prov-tooltip-label">${entry.name}</span><span class="tv-prov-tooltip-value">${PRICE_SYMBOL}${entry.value.toFixed(2)}</span></div>`;
      }).join("");
      tooltipEl.innerHTML = `<div class="tv-prov-tooltip-title">${title}</div>${rows}`;
      const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
      tooltipEl.style.opacity = "1";
      tooltipEl.style.pointerEvents = "none";
      tooltipEl.style.left = `${positionX + tooltip.caretX}px`;
      tooltipEl.style.top = `${positionY + tooltip.caretY}px`;
    }
    function getDistHbarTooltipEl(chart) {
      const parent = chart.canvas.parentNode;
      if (!parent) return null;
      let tooltipEl = parent.querySelector(".tv-dist-hbar-tooltip");
      if (!tooltipEl) {
        tooltipEl = document.createElement("div");
        tooltipEl.className = "tv-dist-hbar-tooltip";
        parent.appendChild(tooltipEl);
      }
      return tooltipEl;
    }
    function externalDistHbarTooltip(context, chartRows = []) {
      const { chart, tooltip } = context;
      const tooltipEl = getDistHbarTooltipEl(chart);
      if (!tooltipEl) return;
      if (!tooltip || tooltip.opacity === 0) {
        tooltipEl.classList.remove("is-visible", "is-updating");
        tooltipEl.style.pointerEvents = "none";
        return;
      }
      const point = tooltip.dataPoints?.[0];
      const label = String(point?.label || tooltip.title?.[0] || "");
      const value = Number(point?.parsed?.x ?? point?.raw) || 0;
      const total = (Array.isArray(chartRows) ? chartRows : []).reduce((sum, row) => sum + (Number(row?.value) || 0), 0) || 1;
      const pct = (value / total * 100).toFixed(1);
      const image = marketplaceTableImage(label);
      const icon = image ? `<img class="tv-dist-hbar-tooltip-icon" src="${image}" alt="" />` : `<span class="tv-dist-hbar-tooltip-fallback" style="background:${marketColor(label)}"></span>`;
      const nextHtml = `
      <div class="tv-dist-hbar-tooltip-row">
        ${icon}
        <span class="tv-dist-hbar-tooltip-title">${label}</span>
        <span class="tv-dist-hbar-tooltip-meta">${formatCount(value)} (${pct}%)</span>
      </div>
    `;
      const prevLabel = tooltipEl.dataset.activeLabel || "";
      const wasVisible = tooltipEl.classList.contains("is-visible");
      if (tooltipEl.innerHTML !== nextHtml) {
        tooltipEl.innerHTML = nextHtml;
        if (wasVisible && prevLabel && prevLabel !== label) {
          tooltipEl.classList.remove("is-updating");
          void tooltipEl.offsetWidth;
          tooltipEl.classList.add("is-updating");
        }
      }
      tooltipEl.dataset.activeLabel = label;
      const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
      const area = chart.chartArea;
      const barEl = point?.element;
      const tipX = Number.isFinite(barEl?.x) ? barEl.x + 14 : Number.isFinite(tooltip.caretX) ? tooltip.caretX + 14 : area ? area.right + 8 : 0;
      const tipY = Number.isFinite(barEl?.y) ? barEl.y : Number.isFinite(tooltip.caretY) ? tooltip.caretY : area ? (area.top + area.bottom) / 2 : 0;
      const barH = Number.isFinite(barEl?.height) ? Math.max(34, Math.round(barEl.height + 8)) : 34;
      const tipLeft = positionX + tipX;
      const tipTop = positionY + tipY;
      const parent = chart.canvas.parentNode;
      const parentWidth = parent?.clientWidth || 0;
      const tooltipWidth = tooltipEl.offsetWidth || 180;
      const clampedLeft = parentWidth > 0 ? Math.min(tipLeft, Math.max(8, parentWidth - tooltipWidth - 6)) : tipLeft;
      tooltipEl.style.pointerEvents = "none";
      tooltipEl.style.height = `${barH}px`;
      tooltipEl.style.left = `${clampedLeft}px`;
      tooltipEl.style.top = `${tipTop}px`;
      tooltipEl.classList.add("is-visible");
    }
    function resolveSteamGrossPrice({
      dynamicQuotes,
      singleMarketActivity,
      qualityRows,
      analyticsBundle,
      baseName,
      selectedWear
    }) {
      const summary = singleMarketActivity?.summary || {};
      const selectedWearRow = Array.isArray(qualityRows) ? qualityRows.find((row) => String(row?.wear || "").trim() === String(selectedWear || "").trim()) : null;
      return positivePrice(dynamicQuotes?.steam?.price) ?? parseSteamPriceDisplay(summary.starting_price) ?? parseSteamPriceDisplay(summary.suggested_price) ?? parseSteamPriceDisplay(summary.starting_price_display) ?? parseSteamPriceDisplay(summary.suggested_price_display) ?? positivePrice(selectedWearRow?.priceGross) ?? positivePrice(selectedWearRow?.price) ?? positivePrice(analyticsBundle?.series?.steam?.current_price) ?? sanitizeProviderPrice(bundleSourcePrice(analyticsBundle, "steam", selectedWear, baseName), 0);
    }
    function steamMarketRowFromQuote(quote) {
      const gross = positivePrice(quote?.price);
      if (!Number.isFinite(gross) || gross <= 0) {
        return null;
      }
      return {
        base_price: Number((gross / 1.15).toFixed(2)),
        fee_pct: 15,
        final_price: Number(gross.toFixed(2)),
        market_url: quote?.market_url || ""
      };
    }
    function buildMarketplacePriceRows({
      itemName,
      wear,
      steamGrossPrice,
      steamMarketUrl,
      dynamicQuotes,
      analyticsBundle,
      remoteProviders,
      steamReference
    }) {
      const rows = MARKETPLACE_PRICE_TABLE.map((entry) => {
        const image = marketplaceTableImage(entry.name);
        const marketUrl = buildMarketplaceSearchUrl(entry.name, itemName, wear);
        const feePct = entry.sourceId === "steam" ? 15 : entry.sourceId ? 0 : marketplaceListingFeePct(entry.key);
        if (entry.sourceId === "steam") {
          const steamPrice = positivePrice(steamGrossPrice);
          const afterTax2 = Number.isFinite(steamPrice) ? steamPrice / 1.15 : null;
          return {
            name: entry.name,
            image,
            basePrice: Number.isFinite(afterTax2) ? formatTablePrice(afterTax2) : "—",
            fee: "15%",
            finalPrice: Number.isFinite(steamPrice) ? formatTablePrice(steamPrice) : "—",
            unavailable: !Number.isFinite(steamPrice),
            market_url: steamMarketUrl || marketUrl
          };
        }
        let price = null;
        let resolvedUrl = marketUrl;
        if (entry.sourceId) {
          const quote = sanitizeMarketplaceQuote(
            dynamicQuotes?.[entry.sourceId],
            steamReference,
            entry.sourceId,
            itemName,
            wear
          );
          price = positivePrice(quote?.price) ?? sanitizeProviderPrice(bundleSourcePrice(analyticsBundle, entry.sourceId, wear, itemName), steamReference, true) ?? sanitizeProviderPrice(latestRemoteProviderPrice(remoteProviders, entry.key), steamReference, true);
          if (quote?.market_url) {
            resolvedUrl = quote.market_url;
          } else {
            const bundleUrl = sourceMarketplaceUrl(entry.sourceId, itemName, wear, analyticsBundle);
            if (bundleUrl) {
              resolvedUrl = bundleUrl;
            }
          }
        } else {
          price = sanitizeProviderPrice(latestRemoteProviderPrice(remoteProviders, entry.key), steamReference);
        }
        const basePrice = Number.isFinite(price) ? price : null;
        const finalPrice = Number.isFinite(basePrice) ? feePct > 0 ? basePrice * (1 + feePct / 100) : basePrice : null;
        const afterTax = Number.isFinite(finalPrice) && feePct > 0 ? finalPrice / (1 + feePct / 100) : basePrice;
        return {
          name: entry.name,
          image,
          basePrice: Number.isFinite(afterTax) ? formatTablePrice(afterTax) : "—",
          fee: formatFee(feePct),
          finalPrice: Number.isFinite(finalPrice) ? formatTablePrice(finalPrice) : "—",
          unavailable: !Number.isFinite(finalPrice),
          market_url: resolvedUrl
        };
      });
      const availableFinals = rows.map((row) => parseNumericDisplay(row.finalPrice)).filter((value) => Number.isFinite(value) && value > 0);
      const bestFinal = availableFinals.length ? Math.min(...availableFinals) : null;
      return rows.map((row) => ({
        ...row,
        best: bestFinal !== null && parseNumericDisplay(row.finalPrice) === bestFinal
      }));
    }
    function normalizeMarketplaceUrl(sourceId, rawUrl, itemName, wear) {
      const cleanWear = String(wear || "").trim();
      if (String(sourceId || "") === "shadowpay") {
        if (cleanWear || String(itemName || "").trim()) {
          return buildShadowPayItemUrl(itemName, cleanWear);
        }
      }
      if (String(sourceId || "") === "skinport") {
        const trimmed = String(rawUrl || "").trim();
        if (!trimmed || !/skinport\.com\/item\//i.test(trimmed)) {
          return buildSkinportItemUrl(itemName, cleanWear);
        }
        return trimmed;
      }
      if (marketplaceUrlMatchesSource(sourceId, rawUrl)) {
        if (String(sourceId || "") === "shadowpay" && cleanWear && !shadowpayUrlIncludesWear(rawUrl, cleanWear)) {
          return buildShadowPayItemUrl(itemName, cleanWear);
        }
        return String(rawUrl || "").trim();
      }
      return buildMarketplaceFallbackUrl(sourceId, itemName, wear);
    }
    function sanitizeWearTableQuote(quote, referencePrice, sourceId = "", itemName = "", wear = "") {
      if (!quote) return null;
      const price = positivePrice(quote.price);
      if (!Number.isFinite(price) || price <= 0) return null;
      const numericReference = Number(referencePrice || 0);
      if (Number.isFinite(numericReference) && numericReference > 0) {
        const ratio = price / Math.max(0.01, numericReference);
        if (ratio > 8 || ratio < 0.05) {
          return null;
        }
      }
      return {
        ...quote,
        price,
        market_url: normalizeMarketplaceUrl(sourceId, quote.market_url || "", itemName, wear)
      };
    }
    function mergeWearPriceRowLists(primary, fallback) {
      const byWear = {};
      const takePrice = (row) => positivePrice(row?.price) ?? positivePrice(row?.priceGross);
      const takeStatTrak = (row) => positivePrice(row?.stattrak_price) ?? positivePrice(row?.stattrakGross) ?? positivePrice(row?.stattrak);
      const takeSouvenir = (row) => positivePrice(row?.souvenir_price) ?? positivePrice(row?.souvenirGross) ?? positivePrice(row?.souvenir);
      (Array.isArray(fallback) ? fallback : []).forEach((row) => {
        const wear = String(row?.wear || "").trim();
        if (wear) byWear[wear] = row;
      });
      (Array.isArray(primary) ? primary : []).forEach((row) => {
        const wear = String(row?.wear || "").trim();
        if (!wear) return;
        const prev = byWear[wear] || null;
        const price = takePrice(row) ?? takePrice(prev);
        const stattrakPrice = takeStatTrak(row) ?? takeStatTrak(prev);
        const souvenirPrice = takeSouvenir(row) ?? takeSouvenir(prev);
        byWear[wear] = {
          ...prev || {},
          ...row,
          wear,
          price: price != null ? price : row?.price ?? prev?.price ?? null,
          stattrak_price: stattrakPrice != null ? stattrakPrice : row?.stattrak_price ?? prev?.stattrak_price ?? null,
          souvenir_price: souvenirPrice != null ? souvenirPrice : row?.souvenir_price ?? prev?.souvenir_price ?? null
        };
      });
      return INSPECT_WEAR_OPTIONS.map((option) => byWear[option.wear]).filter(Boolean);
    }
    function sanitizeMarketplaceQuote(quote, referencePrice, sourceId = "", itemName = "", wear = "") {
      if (!quote) return null;
      const price = positivePrice(quote.price);
      const marketplace = ["skinport", "csfloat", "white_market", "dmarket", "market_csgo", "shadowpay", "waxpeer", "mannco", "haloskins", "rapidskins"].includes(String(sourceId || ""));
      const flatItem = isFlatMarketItem(itemName);
      const listings = Math.max(0, Number(quote.listings || quote.quantity || 0) || 0);
      if (!Number.isFinite(price) || price <= 0) {
        return null;
      }
      if (isProviderPriceOutlier(price, referencePrice, marketplace, flatItem)) {
        if (!(flatItem && marketplace && listings > 0 && referencePrice > 0)) {
          return null;
        }
        const ratio = price / Math.max(0.01, referencePrice);
        if (ratio < 0.2 || ratio > 4.5) {
          return null;
        }
      }
      return {
        ...quote,
        price,
        market_url: normalizeMarketplaceUrl(sourceId, quote.market_url || "", itemName, wear)
      };
    }
    function sanitizeProviderPrice(value, referencePrice, marketplace = false, flatItem = false) {
      const price = positivePrice(value);
      if (!Number.isFinite(price) || price <= 0 || isProviderPriceOutlier(price, referencePrice, marketplace, flatItem)) {
        return null;
      }
      return price;
    }
    function fetchJsonWithTimeout(url, options = {}, timeoutMs = 12e3) {
      const controller = new AbortController();
      const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
      const externalSignal = options?.signal;
      if (externalSignal) {
        if (externalSignal.aborted) {
          controller.abort();
        } else {
          externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
        }
      }
      const { signal: _ignoredSignal, ...restOptions } = options;
      return fetch(url, {
        ...restOptions,
        signal: controller.signal
      }).then((response) => {
        if (!response.ok) throw new Error(`${url} failed (${response.status})`);
        return response.json();
      }).finally(() => window.clearTimeout(timerId));
    }
    function buildDynamicQuoteMarketNames(baseName, selectedHashName, hasWearVariants, wearOptions = INSPECT_WEAR_OPTIONS, originName = "") {
      const selected = String(selectedHashName || "").trim();
      const base = String(baseName || "").trim();
      const names = hasWearVariants && base ? wearOptions.flatMap((option) => {
        const row = [buildWearMarketHashName(base, option.wear)];
        if (itemSupportsStatTrak(base, originName)) {
          row.push(buildStatTrakMarketHashName(base, option.wear));
        }
        if (itemSupportsSouvenir(base, originName)) {
          row.push(buildSouvenirMarketHashName(base, option.wear));
        }
        return row;
      }) : [selected || base].filter(Boolean);
      if (selected && !names.includes(selected)) {
        names.unshift(selected);
      }
      return Array.from(new Set(names.filter(Boolean)));
    }
    function isStickerSlabName(name) {
      return String(name || "").trim().startsWith("Sticker Slab |");
    }
    function isRegularStickerName(name) {
      const value = String(name || "").trim();
      return value.startsWith("Sticker |") && !isStickerSlabName(value);
    }
    function stickerFamilyPrefix(name) {
      if (isStickerSlabName(name)) {
        return "slab";
      }
      if (isRegularStickerName(name)) {
        return "sticker";
      }
      return "";
    }
    function pickCatalogSearchMatch(rows, targetName) {
      const target = String(targetName || "").trim();
      if (!target || !Array.isArray(rows) || !rows.length) {
        return null;
      }
      const stripWear = (value) => String(value || "").replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, "").trim();
      const exactMarketHash = rows.find((item) => String(item?.market_hash_name || "") === target);
      if (exactMarketHash) {
        return exactMarketHash;
      }
      const exactDisplay = rows.find((item) => String(item?.display_name || "") === target);
      if (exactDisplay) {
        return exactDisplay;
      }
      const targetBase = stripWear(target);
      if (targetBase) {
        const baseMatch = rows.find((item) => {
          const marketHash = String(item?.market_hash_name || "");
          const display = String(item?.display_name || "");
          return marketHash === targetBase || display === targetBase || stripWear(marketHash) === targetBase || stripWear(display) === targetBase;
        });
        if (baseMatch) {
          return baseMatch;
        }
      }
      const family = stickerFamilyPrefix(target);
      if (family) {
        return rows.find((item) => {
          const name = String(item?.market_hash_name || "");
          return name === target || stickerFamilyPrefix(name) === family;
        }) || null;
      }
      return null;
    }
    function normalizeQuoteKey(value) {
      return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
    }
    function extractWearSuffix(name) {
      const match = String(name || "").match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i);
      return match ? normalizeQuoteKey(match[1]) : "";
    }
    function marketHashNameAliases(name) {
      const raw = String(name || "").trim();
      if (!raw) return [];
      const aliases = [raw];
      if (/Holo-Foil/i.test(raw)) aliases.push(raw.replace(/Holo-Foil/gi, "Holo/Foil"));
      if (/Holo\/Foil/i.test(raw)) aliases.push(raw.replace(/Holo\/Foil/gi, "Holo-Foil"));
      return Array.from(new Set(aliases.filter(Boolean)));
    }
    function quoteForMarketHash(quoteLookup, marketHashName) {
      const lookup = quoteLookup && typeof quoteLookup === "object" ? quoteLookup : {};
      for (const alias of marketHashNameAliases(marketHashName)) {
        if (lookup[alias]) {
          return lookup[alias];
        }
      }
      const targetKey = normalizeQuoteKey(marketHashName);
      if (!targetKey) {
        return null;
      }
      for (const alias of marketHashNameAliases(marketHashName)) {
        const aliasKey = normalizeQuoteKey(alias);
        const keyed = Object.values(lookup).find((entry) => {
          const entryName = String(entry?.market_hash_name || entry?.name || "");
          return normalizeQuoteKey(entryName) === aliasKey;
        });
        if (keyed) {
          return keyed;
        }
      }
      const targetFamily = stickerFamilyPrefix(marketHashName);
      if (targetFamily) {
        const familyMatch = Object.values(lookup).find((entry) => {
          const entryName = String(entry?.market_hash_name || entry?.name || "");
          return normalizeQuoteKey(entryName) === targetKey && stickerFamilyPrefix(entryName) === targetFamily;
        });
        if (familyMatch) {
          return familyMatch;
        }
      }
      const targetWear = extractWearSuffix(marketHashName);
      if (targetWear) {
        const targetBaseKey = normalizeQuoteKey(toSteamMarketBaseName(marketHashName));
        const wearMatch = Object.values(lookup).find((entry) => {
          const entryName = String(entry?.market_hash_name || entry?.name || "");
          const entryKey = normalizeQuoteKey(entryName);
          if (entryKey === targetKey) {
            return true;
          }
          if (extractWearSuffix(entryName) !== targetWear) {
            return false;
          }
          return normalizeQuoteKey(toSteamMarketBaseName(entryName)) === targetBaseKey;
        });
        return wearMatch || null;
      }
      const exactMatch = Object.values(lookup).find((entry) => {
        const entryKey = normalizeQuoteKey(entry?.market_hash_name || entry?.name || "");
        return entryKey && entryKey === targetKey;
      });
      if (exactMatch) {
        return exactMatch;
      }
      return null;
    }
    function buildSteamStatTrakMarketNames(baseName, originName = "") {
      const cleanBase = String(baseName || "").trim();
      if (!cleanBase || !itemSupportsStatTrak(cleanBase, originName)) {
        return [];
      }
      return INSPECT_WEAR_OPTIONS.map((option) => buildSteamStatTrakMarketHashName(cleanBase, option.wear));
    }
    function buildSteamSouvenirMarketNames(baseName, originName = "") {
      const cleanBase = String(baseName || "").trim();
      if (!cleanBase || !itemSupportsSouvenir(cleanBase, originName)) {
        return [];
      }
      return INSPECT_WEAR_OPTIONS.map((option) => buildSteamSouvenirMarketHashName(cleanBase, option.wear));
    }
    function buildSteamDynamicQuoteMarketNames(baseName, selectedHashName, hasWearVariants, wearOptions = INSPECT_WEAR_OPTIONS, originName = "") {
      const steamBase = toSteamMarketBaseName(baseName);
      const selected = String(selectedHashName || "").trim();
      const names = hasWearVariants && steamBase ? wearOptions.flatMap((option) => {
        const row = [
          buildWearMarketHashName(steamBase, option.wear)
        ];
        if (itemSupportsStatTrak(steamBase, originName)) {
          row.push(buildSteamStatTrakMarketHashName(steamBase, option.wear));
        }
        if (itemSupportsSouvenir(steamBase, originName)) {
          row.push(buildSteamSouvenirMarketHashName(steamBase, option.wear));
        }
        return row;
      }) : [selected || steamBase].filter(Boolean);
      if (selected && !names.includes(selected)) {
        names.unshift(selected);
      }
      return Array.from(new Set(names.filter(Boolean)));
    }
    function fetchSteamWearQuoteLookup(baseName, preferLive = true) {
      const marketHashNames = INSPECT_WEAR_OPTIONS.map((option) => buildSteamWearMarketHashName(baseName, option.wear)).filter(Boolean);
      if (!marketHashNames.length) {
        return Promise.resolve({});
      }
      return fetchJsonWithTimeout("get_roi_prices_cached.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market_hash_names: marketHashNames,
          source: "steam",
          range: "30d",
          prefer_live: preferLive,
          db_cache_first: !preferLive,
          max_cache_age_hours: preferLive ? 0 : 24,
          steam_catalog_only: false,
          skip_catalog_fallback: true,
          steam_fast_overview: preferLive,
          allow_live_refresh: preferLive,
          steam_listing_fallback: true,
          steam_listing_fallback_limit: marketHashNames.length
        })
      }, preferLive ? 18e3 : 12e3).then((json) => normalizeQuoteItemsByHash(json)).catch(() => ({}));
    }
    function fetchSteamStatTrakQuoteLookup(baseName, preferLive = true, originName = "") {
      const marketHashNames = buildSteamStatTrakMarketNames(baseName, originName);
      if (!marketHashNames.length) {
        return Promise.resolve({});
      }
      return fetchJsonWithTimeout("get_roi_prices_cached.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market_hash_names: marketHashNames,
          source: "steam",
          range: "30d",
          prefer_live: preferLive,
          db_cache_first: !preferLive,
          max_cache_age_hours: preferLive ? 0 : 24,
          steam_fast_overview: preferLive,
          allow_live_refresh: preferLive,
          steam_listing_fallback: true,
          steam_listing_fallback_limit: marketHashNames.length
        })
      }, preferLive ? 18e3 : 12e3).then((json) => normalizeQuoteItemsByHash(json)).catch(() => ({}));
    }
    function fetchSteamSouvenirQuoteLookup(baseName, preferLive = true, originName = "") {
      const marketHashNames = buildSteamSouvenirMarketNames(baseName, originName);
      if (!marketHashNames.length) {
        return Promise.resolve({});
      }
      return fetchJsonWithTimeout("get_roi_prices_cached.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market_hash_names: marketHashNames,
          source: "steam",
          range: "30d",
          prefer_live: preferLive,
          db_cache_first: !preferLive,
          max_cache_age_hours: 24,
          steam_listing_fallback: true,
          steam_listing_fallback_limit: marketHashNames.length
        })
        // A cold live pass walks five Steam names one by one and can take ~30s, so
        // the live budget has to clear that or the request is aborted and the
        // Souvenir column stays empty forever.
      }, preferLive ? 4e4 : 12e3).then((json) => normalizeQuoteItemsByHash(json)).catch(() => ({}));
    }
    function patchQualityRowsWithSteamWearLookup(baseName, prevRows, lookup, overwrite = false) {
      const quoteLookup = lookup && typeof lookup === "object" ? lookup : {};
      if (!Object.keys(quoteLookup).length) {
        return Array.isArray(prevRows) ? prevRows : [];
      }
      const prevByWear = indexWearRows(prevRows);
      return INSPECT_WEAR_OPTIONS.map((option) => {
        const prevRow = prevByWear[option.wear] || createEmptyQualityRows().find((row) => row.wear === option.wear);
        const wearHash = buildSteamWearMarketHashName(baseName, option.wear);
        const wearPrice = positivePrice(quoteForMarketHash(quoteLookup, wearHash)?.price);
        if (wearPrice == null || !overwrite && positivePrice(prevRow?.priceGross) != null) {
          return prevRow;
        }
        const wearFields = buildSteamWearPriceFields(wearPrice);
        return {
          ...prevRow,
          wear: option.wear,
          priceGross: wearPrice,
          price: wearFields.price,
          priceAfterTax: wearFields.priceAfterTax,
          live: true
        };
      });
    }
    function patchQualityRowsWithStatTrakLookup(baseName, prevRows, lookup, overwrite = false) {
      const quoteLookup = lookup && typeof lookup === "object" ? lookup : {};
      if (!Object.keys(quoteLookup).length) {
        return Array.isArray(prevRows) ? prevRows : [];
      }
      const prevByWear = indexWearRows(prevRows);
      return INSPECT_WEAR_OPTIONS.map((option) => {
        const prevRow = prevByWear[option.wear] || createEmptyQualityRows().find((row) => row.wear === option.wear);
        const stHash = buildSteamStatTrakMarketHashName(baseName, option.wear);
        const stPrice = positivePrice(quoteForMarketHash(quoteLookup, stHash)?.price);
        if (stPrice == null || !overwrite && positivePrice(prevRow?.stattrakGross) != null) {
          return prevRow;
        }
        return {
          ...prevRow,
          stattrakGross: stPrice,
          stattrak: formatSteamListingPrice(stPrice),
          stattrakAfterTax: buildSteamWearPriceFields(stPrice).priceAfterTax,
          live: true
        };
      });
    }
    function patchQualityRowsWithSouvenirLookup(baseName, prevRows, lookup) {
      const quoteLookup = lookup && typeof lookup === "object" ? lookup : {};
      if (!Object.keys(quoteLookup).length) {
        return Array.isArray(prevRows) ? prevRows : [];
      }
      const prevByWear = indexWearRows(prevRows);
      return INSPECT_WEAR_OPTIONS.map((option) => {
        const prevRow = prevByWear[option.wear] || createEmptyQualityRows().find((row) => row.wear === option.wear);
        if (positivePrice(prevRow?.souvenirGross) != null || positivePrice(prevRow?.souvenir) != null) {
          return prevRow;
        }
        const svHash = buildSteamSouvenirMarketHashName(baseName, option.wear);
        const svPrice = positivePrice(quoteForMarketHash(quoteLookup, svHash)?.price);
        if (svPrice == null) {
          return prevRow;
        }
        const svFields = buildSteamWearPriceFields(svPrice);
        return {
          ...prevRow,
          souvenirGross: svPrice,
          souvenir: svFields.price,
          souvenirAfterTax: svFields.priceAfterTax,
          live: true
        };
      });
    }
    function quoteForWear(dynamicQuotes, sourceId, baseName, wear) {
      const hashName = sourceId === "steam" ? buildSteamWearMarketHashName(baseName, wear) : buildWearMarketHashName(baseName, wear);
      return quoteForMarketHash(dynamicQuotes?.wears?.[sourceId], hashName);
    }
    function quoteMatchesSelectedWear(quote, wear) {
      if (!quote) return false;
      const selected = String(wear || "").trim();
      if (!selected) return true;
      const name = String(quote.market_hash_name || quote.name || "").trim();
      if (!name) return false;
      const [, quoteWear] = splitSteamWearName(name);
      if (!quoteWear) {
        return !INSPECT_WEAR_OPTIONS.some((option) => option.wear === selected);
      }
      return String(quoteWear).toLowerCase() === selected.toLowerCase();
    }
    function resolveMarketplaceCompareQuote(dynamicQuotes, sourceId, baseName, wear, hasWearVariants) {
      if (!hasWearVariants) {
        return dynamicQuotes?.[sourceId] || null;
      }
      const wearQuote = quoteForWear(dynamicQuotes, sourceId, baseName, wear);
      if (wearQuote && positivePrice(wearQuote.price)) {
        return wearQuote;
      }
      const topLevel = dynamicQuotes?.[sourceId] || null;
      if (topLevel && quoteMatchesSelectedWear(topLevel, wear) && positivePrice(topLevel.price)) {
        return topLevel;
      }
      return wearQuote || null;
    }
    function marketplaceOwnershipForWear(dynamicQuotes, bundle, sourceId, baseName, wear) {
      const quote = quoteForWear(dynamicQuotes, sourceId, baseName, wear);
      const wearCount = Math.max(0, Number(quote?.listings || 0));
      if (wearCount > 0) return wearCount;
      const topLevel = dynamicQuotes?.[sourceId] || null;
      if (topLevel && quoteMatchesSelectedWear(topLevel, wear)) {
        return Math.max(0, Number(topLevel.listings || 0));
      }
      return 0;
    }
    function mergeWearListingCounts(sourceId, counts) {
      const positive = (Array.isArray(counts) ? counts : []).map((n) => Math.max(0, Math.round(Number(n) || 0))).filter((n) => n > 0);
      if (!positive.length) return 0;
      const unique = [...new Set(positive)];
      const id = String(sourceId || "").toLowerCase();
      const alreadyAllWear = id !== "steam" && positive.length >= 2 && unique.length === 1;
      if (id === "skinport" || alreadyAllWear) return unique[0];
      return positive.reduce((sum, n) => sum + n, 0);
    }
    function buildListingShareLeaders(entries, limit = 0) {
      const ranked = normalizeDistributionEntries(entries).filter((entry) => entry.marketplace !== "Other" && Number(entry.volume) > 0).map((entry) => ({
        sourceId: String(entry.marketplace || "").toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label: entry.marketplace,
        ownership: Math.max(0, Number(entry.volume) || 0)
      })).sort((left, right) => right.ownership - left.ownership);
      const capped = limit > 0 ? ranked.slice(0, Math.max(1, limit)) : ranked;
      const maxOwnership = Math.max(1, capped[0]?.ownership || 1);
      const grandTotal = capped.reduce((sum, row) => sum + row.ownership, 0) || 1;
      return capped.map((row) => ({
        ...row,
        barPct: row.ownership / maxOwnership * 100,
        sharePct: row.ownership / grandTotal * 100
      }));
    }
    function buildTopMarketplaceOwnership(dynamicQuotes, bundle, baseName, wears, limit = 0) {
      const wearList = Array.isArray(wears) && wears.length ? wears : INSPECT_WEAR_OPTIONS.map((option) => option.wear);
      const providers = [
        { sourceId: "steam", label: "Steam" },
        ...WEAR_TABLE_MARKETPLACES.map((entry) => ({ sourceId: entry.id, label: entry.label }))
      ];
      const ranked = providers.map((provider) => {
        const ownership = mergeWearListingCounts(
          provider.sourceId,
          wearList.map((wear) => marketplaceOwnershipForWear(
            dynamicQuotes,
            bundle,
            provider.sourceId,
            baseName,
            wear
          ))
        );
        return { ...provider, ownership };
      }).filter((row) => row.ownership > 0).sort((left, right) => right.ownership - left.ownership);
      const capped = limit > 0 ? ranked.slice(0, limit) : ranked;
      const maxOwnership = Math.max(1, capped[0]?.ownership || 1);
      const grandTotal = capped.reduce((sum, row) => sum + row.ownership, 0) || 1;
      return capped.map((row) => ({
        ...row,
        barPct: row.ownership / maxOwnership * 100,
        sharePct: row.ownership / grandTotal * 100
      }));
    }
    function scrubPlaceholderDistributionVolumes(entries) {
      const rows = (Array.isArray(entries) ? entries : []).map((entry) => ({
        label: String(entry?.label || entry?.marketplace || ""),
        value: Math.max(0, Math.round(Number(entry?.value ?? entry?.ownership ?? entry?.volume) || 0))
      })).filter((entry) => entry.label && entry.label !== "Other" && entry.value > 0);
      if (rows.length < 5) {
        return rows;
      }
      const steamRow = rows.find((entry) => String(entry.label).toLowerCase() === "steam");
      const steamVolume = Number(steamRow?.value || 0);
      const nonSteam = rows.filter((entry) => String(entry.label).toLowerCase() !== "steam");
      if (steamVolume < 50 || nonSteam.length < 4) {
        return rows;
      }
      const ones = nonSteam.filter((entry) => entry.value === 1);
      if (ones.length === nonSteam.length) {
        return rows.filter((entry) => String(entry.label).toLowerCase() === "steam" || entry.value > 1);
      }
      return rows;
    }
    function buildDistributionChartRows(distributionData, dynamicQuotes, bundle, baseName, selectedWear, hasWearVariants) {
      const providers = [
        { sourceId: "steam", label: "Steam" },
        ...WEAR_TABLE_MARKETPLACES.map((entry) => ({ sourceId: entry.id, label: entry.label }))
      ];
      const fromDist = scrubPlaceholderDistributionVolumes(
        normalizeDistributionEntries(distributionData).map((entry) => ({
          label: entry.marketplace,
          value: entry.volume
        }))
      );
      const distByLabel = new Map(
        fromDist.map((row) => [String(row.label).toLowerCase(), Math.max(0, Math.round(Number(row.value) || 0))])
      );
      const wearList = INSPECT_WEAR_OPTIONS.map((option) => option.wear);
      const rows = providers.map((provider) => {
        let live = 0;
        if (hasWearVariants) {
          live = mergeWearListingCounts(
            provider.sourceId,
            wearList.map((wear) => marketplaceOwnershipForWear(
              dynamicQuotes,
              bundle,
              provider.sourceId,
              baseName,
              wear
            ))
          );
        } else {
          live = Math.max(0, Number(dynamicQuotes?.[provider.sourceId]?.listings || 0) || 0);
        }
        const fromApi = distByLabel.get(String(provider.label).toLowerCase()) || 0;
        const value = Math.max(live, fromApi);
        return {
          label: provider.label,
          value: Math.max(0, Math.round(Number(value) || 0))
        };
      });
      return rows.sort((left, right) => right.value - left.value);
    }
    function buildWearRowsFromQuotes(dynamicQuotes, sourceId, baseName, sourceLabel, originName = "") {
      const supportsStatTrak = itemSupportsStatTrak(baseName, originName);
      const supportsSouvenir = itemSupportsSouvenir(baseName, originName);
      return INSPECT_WEAR_OPTIONS.map((option) => {
        const quote = quoteForWear(dynamicQuotes, sourceId, baseName, option.wear);
        const stattrakQuote = supportsStatTrak ? quoteForMarketHash(
          dynamicQuotes?.wears?.[sourceId],
          sourceId === "steam" ? buildSteamStatTrakMarketHashName(baseName, option.wear) : buildStatTrakMarketHashName(baseName, option.wear)
        ) : null;
        const souvenirQuote = supportsSouvenir ? quoteForMarketHash(
          dynamicQuotes?.wears?.[sourceId],
          sourceId === "steam" ? buildSteamSouvenirMarketHashName(baseName, option.wear) : buildSouvenirMarketHashName(baseName, option.wear)
        ) : null;
        const sameWearSteam = quoteForWear(dynamicQuotes, "steam", baseName, option.wear);
        const sanitizedQuote = sanitizeWearTableQuote(
          quote,
          sourceId === "steam" ? null : positivePrice(sameWearSteam?.price),
          sourceId,
          baseName,
          option.wear
        );
        if (!sanitizedQuote) return null;
        if (!quote) return null;
        const stattrakPrice = positivePrice(stattrakQuote?.price);
        const souvenirPrice = positivePrice(souvenirQuote?.price);
        return {
          wear: option.wear,
          price: sanitizedQuote.price,
          stattrak_price: Number.isFinite(stattrakPrice) && stattrakPrice > 0 ? stattrakPrice : null,
          souvenir_price: Number.isFinite(souvenirPrice) && souvenirPrice > 0 ? souvenirPrice : null,
          market_url: sanitizedQuote.market_url || "",
          source: sourceId,
          source_label: sourceLabel,
          quantity: sanitizedQuote.listings || 0
        };
      }).filter(Boolean);
    }
    function interpolateQuoteValues(values, targetCount) {
      const rows = values.filter((value) => Number.isFinite(value) && value > 0);
      if (rows.length < 2 || rows.length >= targetCount) {
        return rows;
      }
      const lastIndex = rows.length - 1;
      return Array.from({ length: targetCount }, (_, index) => {
        const position = index / Math.max(1, targetCount - 1) * lastIndex;
        const leftIndex = Math.floor(position);
        const rightIndex = Math.min(lastIndex, leftIndex + 1);
        const ratio = position - leftIndex;
        const value = rows[leftIndex] + (rows[rightIndex] - rows[leftIndex]) * ratio;
        return Number(value.toFixed(4));
      });
    }
    function buildQuoteFallbackPoints(quote, range, seedText = "") {
      const directPoints = quoteSparklinePoints(quote, range);
      if (directPoints.length >= 2) {
        return directPoints;
      }
      const currentPrice = Number(quote?.price || 0);
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        return [];
      }
      const rangeKey = String(range || "").toUpperCase();
      if (rangeKey === "ALL" || rangeKey === "MAX") {
        return [];
      }
      const rangeDays = {
        "7D": 7,
        "30D": 30,
        "90D": 90,
        "180D": 180,
        "1M": 30,
        "3M": 90,
        "6M": 180,
        "1Y": 365
      }[rangeKey] || 30;
      const pointCount = rangeDays <= 7 ? 8 : rangeDays <= 30 ? 14 : rangeDays <= 90 ? 18 : 24;
      const seed = Math.abs(Array.from(String(seedText || quote?.market_hash_name || "item")).reduce((sum, char) => sum + char.charCodeAt(0), 0));
      const endDate = new Date(quote?.updated_at || Date.now());
      const safeEndDate = Number.isNaN(endDate.getTime()) ? /* @__PURE__ */ new Date() : endDate;
      const stepDays = rangeDays / Math.max(1, pointCount - 1);
      return Array.from({ length: pointCount }, (_, index) => {
        const progress = index / Math.max(1, pointCount - 1);
        const drift = (progress - 1) * 0.018;
        const wave = Math.sin((index + seed % 13) / 3.2) * 6e-3;
        const price = Math.max(0.03, currentPrice * (1 + drift + wave));
        const date = new Date(safeEndDate);
        date.setUTCDate(date.getUTCDate() - Math.round(stepDays * (pointCount - index - 1)));
        return {
          date: date.toISOString().slice(0, 10),
          price: Number(price.toFixed(4)),
          volume: Number(quote?.listings || 1) || 1,
          synthetic: true
        };
      });
    }
    const PROVIDER_CHART_RANGE_DAYS = {
      "30D": 30,
      "90D": 90,
      "180D": 180,
      "1Y": 365,
      "ALL": CHART_MAX_RANGE_DAYS,
      "MAX": CHART_MAX_RANGE_DAYS
    };
    function isLifetimeProviderRange(range) {
      const rangeKey = String(range || "").toUpperCase();
      return rangeKey === "ALL" || rangeKey === "MAX";
    }
    function seriesLooksSynthetic(seriesEntry) {
      const points = Array.isArray(seriesEntry?.points) ? seriesEntry.points : [];
      return points.length > 0 && points.every((point) => point?.synthetic);
    }
    function seriesPointCount(seriesEntry) {
      return normalizeAnalyticsSeriesPoints(seriesEntry?.points || []).length;
    }
    function pickPreferredSteamSeries(dynamicEntry, fallbackEntry, range, referencePrice = 0) {
      const rangeKey = String(range || "ALL").toUpperCase();
      const preferLongest = rangeKey === "ALL" || rangeKey === "MAX";
      const dynamicPoints = normalizeAnalyticsSeriesPoints(dynamicEntry?.points || []);
      const fallbackPoints = normalizeAnalyticsSeriesPoints(fallbackEntry?.points || []);
      const reference = positivePrice(referencePrice) || seriesAnchorPrice(dynamicEntry) || seriesAnchorPrice(fallbackEntry);
      const fallbackIsSynthetic = seriesLooksSynthetic(fallbackEntry);
      if (fallbackIsSynthetic) {
        return dynamicEntry && dynamicPoints.length >= 2 ? dynamicEntry : dynamicEntry || null;
      }
      if (dynamicPoints.length < 2) {
        if (fallbackEntry && seriesPriceNearReference(fallbackEntry, reference) && !fallbackIsSynthetic) {
          return fallbackEntry;
        }
        return dynamicEntry || fallbackEntry;
      }
      if (!fallbackEntry || fallbackPoints.length < 2) {
        return dynamicEntry;
      }
      if (preferLongest) {
        if (fallbackIsSynthetic) {
          return dynamicEntry;
        }
        if (reference && !seriesPriceNearReference(fallbackEntry, reference, 0.55)) {
          return dynamicEntry;
        }
        if (reference && !seriesPriceNearReference(dynamicEntry, reference, 0.55) && seriesPriceNearReference(fallbackEntry, reference, 0.55)) {
          return fallbackEntry;
        }
        const dynamicStart = String(dynamicPoints[0]?.date || "");
        const fallbackStart = String(fallbackPoints[0]?.date || "");
        if (fallbackPoints.length > dynamicPoints.length * 1.15) {
          return fallbackEntry;
        }
        if (fallbackStart && dynamicStart && fallbackStart < dynamicStart && fallbackPoints.length >= dynamicPoints.length) {
          return fallbackEntry;
        }
        return dynamicEntry;
      }
      if (isLiveSteamHistorySeries(dynamicEntry) || fallbackIsSynthetic) {
        return dynamicEntry;
      }
      if (!seriesPriceNearReference(fallbackEntry, reference)) {
        return dynamicEntry;
      }
      return dynamicEntry;
    }
    function filterProviderPointsByRange(points, range) {
      const normalized = normalizeAnalyticsSeriesPoints(points);
      const rangeKey = String(range || "").toUpperCase();
      if (isLifetimeProviderRange(rangeKey)) {
        return normalized;
      }
      const days = PROVIDER_CHART_RANGE_DAYS[rangeKey] || 90;
      const cutoff = /* @__PURE__ */ new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - days);
      const cutoffKey = cutoff.toISOString().slice(0, 10);
      return normalized.filter((point) => String(point.date || "").slice(0, 10) >= cutoffKey);
    }
    function quoteHistoryDateFromPoint(point) {
      if (point?.date) {
        return parseChartPointDateKey(point.date);
      }
      if (point?.day) {
        return parseChartPointDateKey(point.day);
      }
      if (point?.recorded_at) {
        return parseChartPointDateKey(point.recorded_at);
      }
      if (point?.time != null) {
        return parseChartPointDateKey(point.time);
      }
      return "";
    }
    function buildQuoteHistoryPoints(quote, range) {
      const rawHistory = quote?.price_history;
      if (rawHistory) {
        let decoded = rawHistory;
        if (typeof rawHistory === "string") {
          try {
            decoded = JSON.parse(rawHistory);
          } catch {
            decoded = [];
          }
        }
        if (Array.isArray(decoded) && decoded.length) {
          const historyPoints = normalizeAnalyticsSeriesPoints(
            decoded.map((point) => ({
              date: quoteHistoryDateFromPoint(point),
              price: point?.price ?? point?.value ?? point?.current_price,
              volume: point?.volume ?? point?.quantity ?? 0
            }))
          );
          if (historyPoints.length >= 2) {
            const anchor = positivePrice(quote?.price) || historyPoints[historyPoints.length - 1]?.price || 0;
            const cleaned = historyPoints.filter((point) => !isProviderPriceOutlier(point.price, anchor, true));
            const series = cleaned.length >= 2 ? cleaned : historyPoints;
            return filterProviderPointsByRange(series, range);
          }
        }
      }
      const sparklinePoints = quoteSparklinePoints(quote, range);
      if (sparklinePoints.length >= 2) {
        return sparklinePoints;
      }
      return [];
    }
    function buildProviderQuotePoints(quote, range, seedText = "") {
      const historyPoints = buildQuoteHistoryPoints(quote, range);
      if (historyPoints.length >= 2) {
        return historyPoints;
      }
      return buildQuoteFallbackPoints(quote, range, seedText);
    }
    function quoteSparklinePoints(quote, range) {
      const values = Array.isArray(quote?.sparkline) ? quote.sparkline.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0) : [];
      if (values.length < 2) {
        return [];
      }
      const chartValues = values;
      const rangeKey = String(range || "").toUpperCase();
      if (rangeKey === "ALL" || rangeKey === "MAX") {
        return [];
      }
      const rangeDays = {
        "7D": 7,
        "1M": 30,
        "3M": 90,
        "6M": 180,
        "1Y": 365
      }[rangeKey] || Math.min(120, Math.max(21, chartValues.length * 10));
      const targetPointCount = Math.min(80, Math.max(chartValues.length, Math.min(Math.round(rangeDays) + 1, 36)));
      const smoothedValues = interpolateQuoteValues(chartValues, targetPointCount);
      const endDate = new Date(quote?.updated_at || Date.now());
      const safeEndDate = Number.isNaN(endDate.getTime()) ? /* @__PURE__ */ new Date() : endDate;
      const stepDays = smoothedValues.length > 1 ? rangeDays / (smoothedValues.length - 1) : 1;
      const dates = smoothedValues.map((_, index) => {
        const date = new Date(safeEndDate);
        date.setUTCDate(date.getUTCDate() - Math.round(stepDays * (smoothedValues.length - index - 1)));
        return date.toISOString().slice(0, 10);
      });
      return smoothedValues.map((price, index) => ({
        date: dates[index],
        price,
        volume: Number(quote?.listings || 1) || 1,
        synthetic: true
      })).filter((point) => point.date && point.price > 0);
    }
    function buildDynamicAnalyticsBundle(activity, range, marketHashName, dynamicQuotes, sourceId, baseName, originName = "") {
      const steamBundle = buildSingleMarketAnalyticsBundle(activity, range, marketHashName) || {
        success: true,
        item_id: 0,
        range,
        selected_source: "steam",
        series: {},
        snapshot_cards: [],
        summary: {}
      };
      const [, detectedWear] = splitSteamWearName(marketHashName || "");
      const fallbackWear = detectedWear || DEFAULT_WEAR;
      const hasWearVariants = queryItemHasWearVariants(
        baseName,
        QUERY_TYPE_FILTER,
        QUERY_CATEGORY,
        QUERY_SINGLE_ITEM,
        IS_DEFAULT_TEMPLATE_ITEM
      );
      const fallbackBundle = buildAnalyticsBundleFallback(sourceId, fallbackWear);
      const series = { ...steamBundle.series || {} };
      const snapshotCards = [...steamBundle.snapshot_cards || []];
      const steamQuote = dynamicQuotes?.steam || null;
      const steamPointCount = normalizeAnalyticsSeriesPoints(series.steam?.points || []).length;
      const activityHasHistory = steamPointCount >= 2 || isLiveSteamHistorySource(activity?.history_source);
      if (steamQuote && !activityHasHistory && steamPointCount < 2) {
        const points = buildQuoteFallbackPoints(steamQuote, range, marketHashName);
        if (points.length >= 2) {
          series.steam = {
            id: "steam",
            label: "Steam",
            points,
            point_count: points.length,
            current_price: steamQuote.price,
            current_volume: steamQuote.listings || points[points.length - 1]?.volume || 0,
            updated_at: steamQuote.updated_at || (/* @__PURE__ */ new Date()).toISOString(),
            market_url: steamQuote.market_url || buildSteamMarketUrlFromHash(marketHashName)
          };
        }
      }
      const steamReferencePrice = positivePrice(series.steam?.current_price) || positivePrice(steamQuote?.price) || positivePrice(fallbackBundle?.series?.steam?.current_price) || 0;
      ["skinport", "csfloat", "white_market", "dmarket", "market_csgo", "shadowpay", "waxpeer", "mannco", "haloskins", "rapidskins"].forEach((id) => {
        const rawQuote = dynamicQuotes?.[id] || null;
        const quote = sanitizeMarketplaceQuote(rawQuote, steamReferencePrice, id, baseName, fallbackWear);
        const points = quote ? buildProviderQuotePoints(quote, range, `${marketHashName}:${id}`) : [];
        const fallbackSeries = fallbackBundle.series?.[id] || null;
        const finalPoints = points.length >= 2 ? points : fallbackSeries?.points || [];
        const currentPrice = Number(quote?.price || fallbackSeries?.current_price || 0);
        const currentVolume = Number(quote?.listings || fallbackSeries?.current_volume || finalPoints[finalPoints.length - 1]?.volume || 0);
        if (finalPoints.length) {
          series[id] = {
            id,
            label: sourceMarketplaceLabel(id),
            points: finalPoints,
            point_count: finalPoints.length,
            current_price: currentPrice,
            current_volume: currentVolume,
            updated_at: quote?.updated_at || fallbackSeries?.updated_at || (/* @__PURE__ */ new Date()).toISOString(),
            market_url: quote?.market_url || ""
          };
        }
        snapshotCards.push({
          id,
          label: sourceMarketplaceLabel(id),
          price: currentPrice,
          volume: currentVolume,
          updated_at: quote?.updated_at || fallbackSeries?.updated_at || (/* @__PURE__ */ new Date()).toISOString(),
          market_url: quote?.market_url || ""
        });
      });
      return {
        ...steamBundle,
        exact_dynamic: true,
        selected_source: sourceId,
        series: alignProviderSeriesToSteamShape(series),
        snapshot_cards: snapshotCards,
        wear_prices: hasWearVariants ? {
          steam: buildWearRowsFromQuotes(dynamicQuotes, "steam", baseName, "Steam", originName),
          skinport: buildWearRowsFromQuotes(dynamicQuotes, "skinport", baseName, "Skinport", originName).length ? buildWearRowsFromQuotes(dynamicQuotes, "skinport", baseName, "Skinport", originName) : fallbackBundle.wear_prices?.skinport || [],
          csfloat: buildWearRowsFromQuotes(dynamicQuotes, "csfloat", baseName, "CSFloat", originName).length ? buildWearRowsFromQuotes(dynamicQuotes, "csfloat", baseName, "CSFloat", originName) : fallbackBundle.wear_prices?.csfloat || [],
          white_market: buildWearRowsFromQuotes(dynamicQuotes, "white_market", baseName, "White.Market", originName).length ? buildWearRowsFromQuotes(dynamicQuotes, "white_market", baseName, "White.Market", originName) : fallbackBundle.wear_prices?.white_market || [],
          dmarket: buildWearRowsFromQuotes(dynamicQuotes, "dmarket", baseName, "DMarket", originName).length ? buildWearRowsFromQuotes(dynamicQuotes, "dmarket", baseName, "DMarket", originName) : fallbackBundle.wear_prices?.dmarket || [],
          market_csgo: buildWearRowsFromQuotes(dynamicQuotes, "market_csgo", baseName, "Market.CSGO", originName).length ? buildWearRowsFromQuotes(dynamicQuotes, "market_csgo", baseName, "Market.CSGO", originName) : fallbackBundle.wear_prices?.market_csgo || [],
          shadowpay: buildWearRowsFromQuotes(dynamicQuotes, "shadowpay", baseName, "ShadowPay", originName).length ? buildWearRowsFromQuotes(dynamicQuotes, "shadowpay", baseName, "ShadowPay", originName) : fallbackBundle.wear_prices?.shadowpay || [],
          waxpeer: buildWearRowsFromQuotes(dynamicQuotes, "waxpeer", baseName, "Waxpeer", originName).length ? buildWearRowsFromQuotes(dynamicQuotes, "waxpeer", baseName, "Waxpeer", originName) : fallbackBundle.wear_prices?.waxpeer || [],
          mannco: buildWearRowsFromQuotes(dynamicQuotes, "mannco", baseName, "Mannco.store", originName).length ? buildWearRowsFromQuotes(dynamicQuotes, "mannco", baseName, "Mannco.store", originName) : fallbackBundle.wear_prices?.mannco || [],
          haloskins: buildWearRowsFromQuotes(dynamicQuotes, "haloskins", baseName, "HaloSkins", originName).length ? buildWearRowsFromQuotes(dynamicQuotes, "haloskins", baseName, "HaloSkins", originName) : fallbackBundle.wear_prices?.haloskins || [],
          rapidskins: buildWearRowsFromQuotes(dynamicQuotes, "rapidskins", baseName, "RapidSkins", originName).length ? buildWearRowsFromQuotes(dynamicQuotes, "rapidskins", baseName, "RapidSkins", originName) : fallbackBundle.wear_prices?.rapidskins || []
        } : {
          steam: [],
          skinport: [],
          csfloat: [],
          white_market: [],
          dmarket: [],
          market_csgo: [],
          shadowpay: [],
          waxpeer: [],
          mannco: [],
          haloskins: [],
          rapidskins: []
        }
      };
    }
    function formatPercent(value) {
      const number = Number(value || 0);
      return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
    }
    function resolvePriceSourceOption(sourceId) {
      return PRICE_SOURCE_OPTIONS.find((option) => option.id === sourceId) || PRICE_SOURCE_OPTIONS[0];
    }
    function buildPriceHistoryFallback(sourceId, wear) {
      const normalizedSource = String(sourceId || "all").toLowerCase();
      const deltas = PRICE_SOURCE_DELTAS[normalizedSource];
      const volumeFactor = PRICE_SOURCE_VOLUME_FACTORS[normalizedSource] || 1;
      const wearAnchor = QUALITY_ROWS.find((row) => row.wear === wear) || QUALITY_ROWS[0];
      const anchorPrice = Number(wearAnchor?.price || DEMO_PRICE_HISTORY[DEMO_PRICE_HISTORY.length - 1]?.price || 0);
      if (!deltas) {
        return DEMO_PRICE_HISTORY.map((row) => ({
          ...row,
          price: Number((anchorPrice + (Number(row.price) - Number(DEMO_PRICE_HISTORY[DEMO_PRICE_HISTORY.length - 1]?.price || anchorPrice))).toFixed(2)),
          synthetic: true
        }));
      }
      return DEMO_PRICE_HISTORY.map((row, index) => ({
        ...row,
        price: Number((anchorPrice - 6 + deltas[index % deltas.length] + index * 0.24).toFixed(2)),
        volume: Math.max(1, Math.round(Number(row.volume || 0) * volumeFactor)),
        synthetic: true
      }));
    }
    function buildAnalyticsBundleFallback(sourceId, wear = DEFAULT_WEAR) {
      const providerAdjustments = {
        steam: 1,
        skinport: 0.88,
        csfloat: 0.91,
        white_market: 0.86,
        dmarket: 0.82
      };
      const providerIds = ["steam", "skinport", "csfloat", "white_market", "dmarket"];
      const series = {};
      const wearPrices = {};
      const snapshotCards = [];
      providerIds.forEach((providerId) => {
        const points = buildPriceHistoryFallback(providerId, wear);
        const currentPoint = points[points.length - 1] || null;
        const adjustment = providerAdjustments[providerId] || 1;
        series[providerId] = {
          id: providerId,
          label: sourceMarketplaceLabel(providerId),
          points,
          point_count: points.length,
          current_price: currentPoint?.price || 0,
          current_volume: currentPoint?.volume || 0,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        wearPrices[providerId] = QUALITY_ROWS.map((row) => {
          const basePrice = parseSteamPriceDisplay(row.price);
          const estimatedPrice = Number.isFinite(basePrice) && basePrice > 0 ? Number((basePrice * adjustment).toFixed(2)) : null;
          return {
            wear: row.wear,
            source: providerId,
            source_label: sourceMarketplaceLabel(providerId),
            price: estimatedPrice,
            stattrak_price: Number.isFinite(estimatedPrice) ? Number((estimatedPrice * sourceStatTrakMultiplier(providerId)).toFixed(2)) : null,
            market_url: ""
          };
        });
        snapshotCards.push({
          id: providerId,
          label: sourceMarketplaceLabel(providerId),
          price: currentPoint?.price || 0,
          volume: currentPoint?.volume || 0,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      });
      return {
        success: true,
        selected_source: sourceId,
        series,
        snapshot_cards: snapshotCards,
        wear_prices: wearPrices
      };
    }
    function buildWearMarketUrl(itemName, wear) {
      const marketName = toSteamMarketBaseName(itemName);
      const cleanWear = String(wear || "").trim();
      const listingName = cleanWear ? `${marketName} (${cleanWear})` : marketName;
      return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(listingName)}?l=english`;
    }
    function sourceMarketplaceLabel(sourceId) {
      if (sourceId === "skinport") return "Skinport";
      if (sourceId === "csfloat") return "CSFloat";
      if (sourceId === "white_market") return "White.Market";
      if (sourceId === "dmarket") return "DMarket";
      if (sourceId === "market_csgo") return "Market.CSGO";
      if (sourceId === "shadowpay") return "ShadowPay";
      if (sourceId === "waxpeer") return "Waxpeer";
      if (sourceId === "mannco") return "Mannco.store";
      if (sourceId === "haloskins") return "HaloSkins";
      if (sourceId === "rapidskins") return "RapidSkins";
      return "Steam";
    }
    function sourceMarketplaceIcon(sourceId) {
      return sourceId === "steam" ? "fa-brands fa-steam" : "fa-solid fa-arrow-up-right-from-square";
    }
    function sourceStatTrakMultiplier(sourceId) {
      if (sourceId === "skinport") return 1.12;
      if (sourceId === "csfloat") return 1.14;
      if (sourceId === "white_market") return 1.13;
      if (sourceId === "dmarket") return 1.11;
      if (sourceId === "market_csgo") return 1.09;
      if (sourceId === "shadowpay") return 1.08;
      if (sourceId === "waxpeer") return 1.07;
      if (sourceId === "mannco") return 1.05;
      if (sourceId === "haloskins") return 1.06;
      if (sourceId === "rapidskins") return 1.04;
      return 1.16;
    }
    function sourceMarketplaceUrl(sourceId, itemName, wear, bundle) {
      const safeWear = itemSupportsWearRows(itemName, wear) ? wear : "";
      if (sourceId === "shadowpay") {
        return buildShadowPayItemUrl(itemName, safeWear);
      }
      if (safeWear) {
        const sourceRows = Array.isArray(bundle?.wear_prices?.[sourceId]) ? bundle.wear_prices[sourceId] : [];
        const sourceRow = sourceRows.find((row) => row?.wear === safeWear);
        if (sourceRow?.market_url && marketplaceUrlMatchesSource(sourceId, sourceRow.market_url)) {
          return sourceRow.market_url;
        }
      }
      const seriesUrl = bundle?.series?.[sourceId]?.market_url || "";
      if (marketplaceUrlMatchesSource(sourceId, seriesUrl)) {
        return String(seriesUrl).trim();
      }
      const snapshotUrl = bundleSourceSnapshot(bundle, sourceId)?.market_url || "";
      if (marketplaceUrlMatchesSource(sourceId, snapshotUrl)) {
        return String(snapshotUrl).trim();
      }
      return buildMarketplaceFallbackUrl(sourceId, itemName, safeWear);
    }
    function sanitizeAnalyticsBundle(bundle, wear = "", itemName = "", range = "ALL") {
      if (!bundle || typeof bundle !== "object") {
        return bundle;
      }
      const rangeKey = String(range || "ALL").toUpperCase();
      const isLifetimeRange = rangeKey === "ALL" || rangeKey === "MAX";
      const referencePrice = sanitizeProviderPrice(bundleSourcePrice(bundle, "steam", wear, itemName), 0) || sanitizeProviderPrice(bundleSourcePrice(bundle, "skinport", wear, itemName), 0) || sanitizeProviderPrice(bundleSourcePrice(bundle, "dmarket", wear, itemName), 0) || sanitizeProviderPrice(bundleSourcePrice(bundle, "white_market", wear, itemName), 0) || sanitizeProviderPrice(bundleSourcePrice(bundle, "csfloat", wear, itemName), 0) || 0;
      const sanitizePointArray = (points, seriesId = "", seriesEntry = null) => {
        const normalized = normalizeAnalyticsSeriesPoints(points || []).map((point) => ({
          ...point,
          price: Number(point.price),
          volume: Number(point.volume || 0)
        })).filter((point) => Number.isFinite(point.price) && point.price > 0);
        if (seriesId === "steam" && isLifetimeRange) {
          return normalized;
        }
        const ownMedian = chartSeriesMedian(normalized.map((point) => point.price));
        const ownReference = positivePrice(seriesEntry?.current_price) || ownMedian;
        const reference = seriesId === "steam" ? referencePrice || ownMedian : ownReference || referencePrice;
        return filterChartSeriesOutliers(normalized, reference);
      };
      const nextSeries = Object.entries(bundle?.series || {}).reduce((lookup, [seriesId, entry]) => {
        if (!entry || seriesId === "all") {
          lookup[seriesId] = entry;
          return lookup;
        }
        const nextPoints = sanitizePointArray(entry.points || [], seriesId, entry);
        const nextPrice = sanitizeProviderPrice(entry.current_price, referencePrice, seriesId !== "steam") || nextPoints[nextPoints.length - 1]?.price || null;
        lookup[seriesId] = {
          ...entry,
          current_price: nextPrice,
          point_count: nextPoints.length,
          points: nextPoints,
          market_url: normalizeMarketplaceUrl(seriesId, entry.market_url || "", itemName, wear)
        };
        return lookup;
      }, {});
      const nextCards = (Array.isArray(bundle?.snapshot_cards) ? bundle.snapshot_cards : []).map((card) => {
        const sourceId = String(card?.id || "");
        if (!sourceId || sourceId === "all") {
          return card;
        }
        return {
          ...card,
          price: sanitizeProviderPrice(card?.price, referencePrice, sourceId !== "steam"),
          market_url: normalizeMarketplaceUrl(sourceId, card?.market_url || "", itemName, wear)
        };
      });
      const nextWearPrices = Object.entries(bundle?.wear_prices || {}).reduce((lookup, [sourceId, rows]) => {
        lookup[sourceId] = (Array.isArray(rows) ? rows : []).map((row) => {
          const rowWear = String(row?.wear || "");
          const rowPrice = sanitizeProviderPrice(row?.price, 0, false);
          const rowStatTrak = sanitizeProviderPrice(row?.stattrak_price, 0, false);
          return {
            ...row,
            price: rowPrice,
            stattrak_price: rowStatTrak,
            market_url: normalizeMarketplaceUrl(sourceId, row?.market_url || "", itemName, rowWear)
          };
        });
        return lookup;
      }, {});
      return {
        ...bundle,
        series: nextSeries,
        snapshot_cards: nextCards,
        wear_prices: nextWearPrices
      };
    }
    function resolveSourceQualityRows(fallbackRows, bundle, sourceId, selectedWear = "", dynamicQuotes = null, baseName = "") {
      if (sourceId !== "steam" && dynamicQuotes && baseName) {
        const quoteRows = buildWearRowsFromQuotes(dynamicQuotes, sourceId, baseName, sourceMarketplaceLabel(sourceId));
        if (quoteRows.length) {
          const quoteByWear = indexWearRows(quoteRows);
          return INSPECT_WEAR_OPTIONS.map((option) => {
            const row = quoteByWear[option.wear];
            if (!row) {
              return {
                wear: option.wear,
                source: sourceId,
                source_label: sourceMarketplaceLabel(sourceId),
                price: "—",
                stattrak: "—",
                market_url: ""
              };
            }
            return {
              wear: option.wear,
              source: sourceId,
              source_label: row.source_label || sourceMarketplaceLabel(sourceId),
              price: formatTablePrice(row.price),
              stattrak: Number.isFinite(Number(row.stattrak_price)) && Number(row.stattrak_price) > 0 ? formatTablePrice(row.stattrak_price) : "—",
              market_url: row.market_url || ""
            };
          });
        }
      }
      const sourceRows = Array.isArray(bundle?.wear_prices?.[sourceId]) ? bundle.wear_prices[sourceId] : [];
      const sourceLookup = sourceRows.reduce((lookup, row) => {
        if (row?.wear) lookup[row.wear] = row;
        return lookup;
      }, {});
      const numericSourcePrices = sourceRows.map((row) => Number(row?.price || 0)).filter((price) => Number.isFinite(price) && price > 0);
      const uniqueSourcePrices = Array.from(new Set(numericSourcePrices.map((price) => price.toFixed(2))));
      const suspiciousUniformWearPrices = Boolean(
        bundle?.exact_dynamic && sourceRows.length >= 3 && numericSourcePrices.length >= 3 && uniqueSourcePrices.length <= 1
      );
      const listingRows = LISTING_FALLBACKS[sourceMarketplaceLabel(sourceId)]?.wears || [];
      const listingLookup = listingRows.reduce((lookup, row) => {
        if (row?.wear) lookup[row.wear] = row;
        return lookup;
      }, {});
      const buildEstimatedSourceRows = () => INSPECT_WEAR_OPTIONS.map((option) => {
        const live = listingLookup[option.wear];
        const price = Number(live?.best_price);
        return {
          wear: option.wear,
          source: sourceId,
          source_label: sourceMarketplaceLabel(sourceId),
          price: Number.isFinite(price) && price > 0 ? formatTablePrice(price) : "—",
          stattrak: Number.isFinite(price) && price > 0 ? formatTablePrice(price * sourceStatTrakMultiplier(sourceId)) : "—",
          market_url: ""
        };
      });
      if (!sourceRows.length) {
        if (sourceId === "steam") {
          return fallbackRows.map((row) => {
            const wearFields = buildSteamWearPriceFields(row.priceGross);
            const stFields = buildSteamWearPriceFields(row.stattrakGross);
            return {
              ...row,
              source: sourceId,
              source_label: sourceMarketplaceLabel(sourceId),
              price: row.priceGross != null ? wearFields.price : row.price && row.price !== "—" ? row.price : "—",
              priceAfterTax: row.priceGross != null ? wearFields.priceAfterTax : row.priceAfterTax && row.priceAfterTax !== "—" ? row.priceAfterTax : "—",
              stattrak: row.stattrakGross != null ? stFields.price : row.stattrak && row.stattrak !== "—" ? row.stattrak : "—",
              stattrakAfterTax: row.stattrakGross != null ? stFields.priceAfterTax : row.stattrakAfterTax && row.stattrakAfterTax !== "—" ? row.stattrakAfterTax : "—",
              market_url: row.market_url || ""
            };
          });
        }
        if (bundle?.exact_dynamic) {
          const selectedSourcePrice = Number(bundle?.series?.[sourceId]?.current_price);
          return fallbackRows.map((row) => ({
            ...row,
            source: sourceId,
            source_label: sourceMarketplaceLabel(sourceId),
            price: row.wear === selectedWear && Number.isFinite(selectedSourcePrice) && selectedSourcePrice > 0 ? formatTablePrice(selectedSourcePrice) : "—",
            stattrak: row.wear === selectedWear && Number.isFinite(selectedSourcePrice) && selectedSourcePrice > 0 ? formatTablePrice(selectedSourcePrice * sourceStatTrakMultiplier(sourceId)) : "—",
            market_url: ""
          }));
        }
        if (listingRows.length) {
          return buildEstimatedSourceRows();
        }
      }
      return fallbackRows.map((row) => {
        const live = sourceLookup[row.wear];
        if (suspiciousUniformWearPrices && row.wear !== selectedWear) {
          return {
            ...row,
            source: sourceId,
            source_label: sourceMarketplaceLabel(sourceId),
            price: "—",
            stattrak: "—",
            market_url: ""
          };
        }
        if (!live) {
          const fallbackPriceGross = positivePrice(row.priceGross);
          const fallbackStatTrakGross = positivePrice(row.stattrakGross);
          const fallbackPrice = fallbackPriceGross ?? (sourceId !== "steam" && row.live ? parseSteamPriceDisplay(row.price) : null);
          const fallbackStatTrak = fallbackStatTrakGross ?? (sourceId !== "steam" && row.live ? parseSteamPriceDisplay(row.stattrak) : null);
          if (fallbackPrice !== null) {
            const wearFields2 = buildSteamWearPriceFields(fallbackPrice);
            const stFields2 = buildSteamWearPriceFields(fallbackStatTrak);
            return {
              ...row,
              source: sourceId,
              source_label: sourceMarketplaceLabel(sourceId),
              price: sourceId === "steam" ? wearFields2.price : formatTablePrice(fallbackPrice),
              priceAfterTax: sourceId === "steam" ? wearFields2.priceAfterTax : "—",
              stattrak: Number.isFinite(fallbackStatTrak) && fallbackStatTrak > 0 ? sourceId === "steam" ? stFields2.price : formatTablePrice(fallbackStatTrak) : sourceId === "steam" ? "—" : formatTablePrice(fallbackPrice * sourceStatTrakMultiplier(sourceId)),
              stattrakAfterTax: sourceId === "steam" && Number.isFinite(fallbackStatTrak) && fallbackStatTrak > 0 ? stFields2.priceAfterTax : "—",
              market_url: row.market_url || ""
            };
          }
          if (bundle?.exact_dynamic) {
            return {
              ...row,
              source: sourceId,
              source_label: sourceMarketplaceLabel(sourceId),
              price: "—",
              stattrak: "—",
              market_url: ""
            };
          }
          return {
            ...row,
            source: sourceId,
            source_label: sourceMarketplaceLabel(sourceId),
            market_url: ""
          };
        }
        const wearFields = sourceId === "steam" ? buildSteamWearPriceFields(live.price) : null;
        const stFields = sourceId === "steam" && Number.isFinite(Number(live.stattrak_price)) && Number(live.stattrak_price) > 0 ? buildSteamWearPriceFields(live.stattrak_price) : null;
        return {
          ...row,
          source: sourceId,
          source_label: live.source_label || sourceMarketplaceLabel(sourceId),
          price: sourceId === "steam" ? wearFields?.price || "—" : formatTablePrice(live.price),
          priceAfterTax: sourceId === "steam" ? wearFields?.priceAfterTax || "—" : "—",
          stattrak: Number.isFinite(Number(live.stattrak_price)) && Number(live.stattrak_price) > 0 ? sourceId === "steam" ? stFields?.price || "—" : formatTablePrice(live.stattrak_price) : sourceId === "steam" ? "—" : formatTablePrice(Number(live.price) * sourceStatTrakMultiplier(sourceId)),
          stattrakAfterTax: sourceId === "steam" && stFields ? stFields.priceAfterTax : "—",
          market_url: live.market_url || ""
        };
      });
    }
    function wearTablePriceFromBundle(bundle, sourceId, wear, baseName, selectedWear) {
      if (!itemSupportsWearRows(baseName, wear)) {
        return null;
      }
      if (wear === selectedWear) {
        const seriesPrice = positivePrice(bundleSourceSeries(bundle, sourceId)?.current_price);
        if (seriesPrice != null) {
          return seriesPrice;
        }
      }
      const bundleRow = bundleSourceWearRow(bundle, sourceId, wear, baseName);
      const rowPrice = positivePrice(bundleRow?.price);
      if (rowPrice != null) {
        return rowPrice;
      }
      return bundleSourcePrice(bundle, sourceId, wear, baseName);
    }
    function buildMultiMarketWearTableRows(bundle, baseName, selectedWear = DEFAULT_WEAR, originName = "") {
      return INSPECT_WEAR_OPTIONS.map((option) => {
        const wear = option.wear;
        const markets = {};
        WEAR_TABLE_MARKETPLACES.forEach((provider) => {
          const sourceId = provider.id;
          const price = wearTablePriceFromBundle(bundle, sourceId, wear, baseName, selectedWear);
          const bundleRow = bundleSourceWearRow(bundle, sourceId, wear, baseName);
          markets[sourceId] = {
            price: price != null && price > 0 ? formatTablePrice(price) : "—",
            market_url: bundleRow?.market_url || buildMarketplaceFallbackUrl(sourceId, baseName, wear)
          };
        });
        const steamBundleRow = bundleSourceWearRow(bundle, "steam", wear, baseName);
        markets.steam = {
          price: "—",
          market_url: steamBundleRow?.market_url || buildWearMarketUrl(baseName, wear)
        };
        return {
          wear,
          markets,
          stattrak: "—",
          souvenir: "—"
        };
      });
    }
    function resolveSteamWearTablePrice(steamByWear, dynamicQuotes, baseName, wear) {
      return positivePrice(steamByWear[wear]?.priceGross) ?? positivePrice(steamByWear[wear]?.price);
    }
    function resolveWearTableSteamPrice({
      wear,
      steamByWear
    }) {
      return resolveSteamWearTablePrice(steamByWear, null, null, wear);
    }
    function mergeLiveWearIntoMultiMarketRows(rows, qualityRows, dynamicQuotes, baseName, options = {}) {
      if (!Array.isArray(rows) || !rows.length) {
        return rows;
      }
      const {
        selectedWear = DEFAULT_WEAR,
        chartSteamPrice = null,
        analyticsBundle = null,
        singleMarketActivity = null,
        originName = ""
      } = options;
      const variantKind = resolveWearVariantKind(baseName, originName, qualityRows);
      const supportsStatTrak = variantKind === "stattrak";
      const supportsSouvenir = variantKind === "souvenir";
      const steamByWear = indexWearRows(qualityRows);
      const quoteRowsBySource = WEAR_TABLE_MARKETPLACES.reduce((lookup, provider) => {
        lookup[provider.id] = indexWearRows(
          buildWearRowsFromQuotes(dynamicQuotes, provider.id, baseName, sourceMarketplaceLabel(provider.id), originName)
        );
        return lookup;
      }, {});
      return rows.map((row) => {
        const wear = row.wear;
        const nextMarkets = { ...row.markets || {} };
        const steamMarket = nextMarkets.steam || { price: "—", market_url: "" };
        const steamPrice = resolveWearTableSteamPrice({
          wear,
          steamByWear
        });
        nextMarkets.steam = {
          ...steamMarket,
          price: steamPrice !== null ? formatTablePrice(steamPrice) : "—",
          market_url: steamMarket.market_url || buildWearMarketUrl(baseName, wear)
        };
        WEAR_TABLE_MARKETPLACES.forEach((provider) => {
          const sourceId = provider.id;
          const market = nextMarkets[sourceId] || { price: "—", market_url: "" };
          const quoteRow = quoteRowsBySource[sourceId]?.[wear];
          const quotePrice = positivePrice(quoteRow?.price);
          if (quotePrice !== null) {
            nextMarkets[sourceId] = {
              ...market,
              price: formatTablePrice(quotePrice),
              market_url: quoteRow?.market_url || market.market_url || buildMarketplaceFallbackUrl(sourceId, baseName, wear)
            };
            return;
          }
          if (market.price !== "—") {
            return;
          }
        });
        let stattrak = "—";
        const liveSt = supportsStatTrak ? positivePrice(steamByWear[wear]?.stattrakGross) ?? positivePrice(steamByWear[wear]?.stattrak) : null;
        if (liveSt !== null) {
          stattrak = formatTablePrice(liveSt);
        }
        let souvenir = "—";
        const liveSv = supportsSouvenir ? positivePrice(steamByWear[wear]?.souvenirGross) ?? positivePrice(steamByWear[wear]?.souvenir) : null;
        if (liveSv !== null) {
          souvenir = formatTablePrice(liveSv);
        }
        return { ...row, markets: nextMarkets, stattrak, souvenir };
      });
    }
    function resolveNearestInspectWear(selectedWear, inspectEntries) {
      if (inspectEntries?.Standard?.inspect_url) {
        return "Standard";
      }
      const wearOrder = INSPECT_WEAR_OPTIONS.map((option) => option.wear);
      const availableWears = wearOrder.filter((wear) => Boolean(inspectEntries?.[wear]?.inspect_url));
      if (!availableWears.length) {
        return null;
      }
      if (inspectEntries?.[selectedWear]?.inspect_url) {
        return selectedWear;
      }
      const selectedIndex = Math.max(0, wearOrder.indexOf(selectedWear));
      return availableWears.slice().sort((leftWear, rightWear) => {
        const leftIndex = wearOrder.indexOf(leftWear);
        const rightIndex = wearOrder.indexOf(rightWear);
        const leftDistance = Math.abs(leftIndex - selectedIndex);
        const rightDistance = Math.abs(rightIndex - selectedIndex);
        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }
        return leftIndex - rightIndex;
      })[0];
    }
    function toneClass(value) {
      if (Math.abs(Number(value || 0)) < 0.01) return "flat";
      return Number(value) >= 0 ? "up" : "down";
    }
    function mergeQualityRows(fallbackRows, liveRows) {
      if (!Array.isArray(liveRows) || !liveRows.length) {
        return fallbackRows;
      }
      const rowsByWear = liveRows.reduce((lookup, row) => {
        if (row?.wear) {
          lookup[row.wear] = row;
        }
        return lookup;
      }, {});
      return fallbackRows.map((row) => {
        const liveRow = rowsByWear[row.wear];
        if (!liveRow) return row;
        const nextRow = { ...row };
        const livePrice = positivePrice(liveRow.price);
        const liveStatTrak = positivePrice(liveRow.stattrak);
        if (livePrice !== null) {
          nextRow.price = formatTablePrice(livePrice);
        }
        if (liveStatTrak !== null) {
          nextRow.stattrak = formatTablePrice(liveStatTrak);
        }
        return nextRow;
      });
    }
    function mergeSteamWearQuotes(currentQuotes, qualityRows, baseName, selectedWear = DEFAULT_WEAR, originName = "") {
      if (!Array.isArray(qualityRows) || !qualityRows.length) {
        return currentQuotes || {};
      }
      const variantKind = resolveWearVariantKind(baseName, originName, qualityRows);
      const supportsStatTrak = variantKind === "stattrak";
      const supportsSouvenir = variantKind === "souvenir";
      const steamLookup = { ...currentQuotes && currentQuotes.wears && currentQuotes.wears.steam || {} };
      qualityRows.forEach((row) => {
        const wear = String(row?.wear || "").trim();
        if (!wear) return;
        const wearHash = buildSteamWearMarketHashName(baseName, wear);
        const wearPrice = positivePrice(row?.priceGross) ?? positivePrice(row?.price);
        if (Number.isFinite(wearPrice) && wearPrice > 0) {
          steamLookup[wearHash] = {
            ...steamLookup[wearHash] || {},
            market_hash_name: wearHash,
            price: wearPrice,
            display: formatPrice(wearPrice),
            market_url: buildWearMarketUrl(baseName, wear),
            source: "steam",
            source_label: "Steam Market",
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        if (supportsStatTrak) {
          const stattrakHash = buildSteamStatTrakMarketHashName(baseName, wear);
          const stattrakPrice = positivePrice(row?.stattrakGross) ?? positivePrice(row?.stattrak);
          if (Number.isFinite(stattrakPrice) && stattrakPrice > 0) {
            steamLookup[stattrakHash] = {
              ...steamLookup[stattrakHash] || {},
              market_hash_name: stattrakHash,
              price: stattrakPrice,
              display: formatPrice(stattrakPrice),
              market_url: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(stattrakHash)}?l=english`,
              source: "steam",
              source_label: "Steam Market",
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            };
          }
        }
        if (supportsSouvenir) {
          const souvenirHash = buildSteamSouvenirMarketHashName(baseName, wear);
          const souvenirPrice = positivePrice(row?.souvenirGross) ?? positivePrice(row?.souvenir);
          if (Number.isFinite(souvenirPrice) && souvenirPrice > 0) {
            steamLookup[souvenirHash] = {
              ...steamLookup[souvenirHash] || {},
              market_hash_name: souvenirHash,
              price: souvenirPrice,
              display: formatPrice(souvenirPrice),
              market_url: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(souvenirHash)}?l=english`,
              source: "steam",
              source_label: "Steam Market",
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            };
          }
        }
      });
      const selectedHash = buildSteamWearMarketHashName(baseName, selectedWear || DEFAULT_WEAR);
      const selectedQuote = steamLookup[selectedHash] || currentQuotes?.steam || null;
      return {
        ...currentQuotes || {},
        steam: selectedQuote || currentQuotes?.steam || null,
        wears: {
          ...currentQuotes && currentQuotes.wears || {},
          steam: steamLookup
        }
      };
    }
    function buildComparisonRowFromListings(listings) {
      const basePrice = Number(listings?.base_price ?? listings?.best_price);
      const feePct = Number(listings?.fee_pct ?? 0);
      const explicitFinalPrice = Number(listings?.final_price);
      const finalPrice = Number.isFinite(explicitFinalPrice) ? explicitFinalPrice : basePrice * (1 + feePct / 100);
      if (!Number.isFinite(basePrice) || basePrice <= 0 || !Number.isFinite(finalPrice)) {
        return null;
      }
      return {
        base_price: Number(basePrice.toFixed(2)),
        fee_pct: Number(feePct.toFixed(2)),
        final_price: Number(finalPrice.toFixed(2))
      };
    }
    function mergeMarketRows(steamMarket, skinportMarket, remoteMarkets = {}) {
      const fallbackRows = [...PRIMARY_MARKET_ROWS, ...EXTRA_MARKET_ROWS];
      if (!steamMarket && !skinportMarket && !Object.keys(remoteMarkets).length) {
        return fallbackRows;
      }
      const liveMarkets = {
        "Steam Market": steamMarket,
        Steam: steamMarket,
        skinport: skinportMarket,
        Skinport: skinportMarket,
        ...remoteMarkets
      };
      return fallbackRows.map((row) => {
        const rawName = String(row.name || "");
        const canonical = canonicalMarketName(rawName);
        const liveRow = liveMarkets[rawName] || liveMarkets[canonical] || null;
        if (!liveRow) {
          return row;
        }
        const basePrice = Number(liveRow.base_price ?? liveRow.best_price);
        const feePct = Number(liveRow.fee_pct ?? 0);
        const finalPrice = Number.isFinite(Number(liveRow.final_price)) ? Number(liveRow.final_price) : basePrice * (1 + feePct / 100);
        const isSteamRow = canonical === "Steam Market" || canonical === "Steam";
        const afterTax = isSteamRow ? Number.isFinite(finalPrice) ? finalPrice / 1.15 : basePrice : feePct > 0 && Number.isFinite(finalPrice) ? finalPrice / (1 + feePct / 100) : basePrice;
        if (!Number.isFinite(basePrice) || basePrice <= 0 || !Number.isFinite(finalPrice)) {
          return row;
        }
        return {
          ...row,
          basePrice: formatTablePrice(afterTax),
          fee: formatFee(feePct),
          finalPrice: formatTablePrice(finalPrice),
          market_url: liveRow.market_url || row.market_url || ""
        };
      });
    }
    function buildSteamListingsFallback(steamSnapshot) {
      const fallback = LISTING_FALLBACKS.Steam;
      const rowsByWear = Array.isArray(steamSnapshot?.quality_rows) ? steamSnapshot.quality_rows.reduce((lookup, row) => {
        if (row?.wear) {
          lookup[row.wear] = row;
        }
        return lookup;
      }, {}) : {};
      const wears = fallback.wears.map((row) => {
        const liveRow = rowsByWear[row.wear];
        return liveRow ? { ...row, best_price: Number(liveRow.price) } : row;
      });
      const factoryNew = rowsByWear["Factory New"];
      return {
        ...fallback,
        best_price: factoryNew ? Number(factoryNew.price) : fallback.best_price,
        wears
      };
    }
    function buildSkinportListingsFallback(skinportSnapshot) {
      const fallback = LISTING_FALLBACKS.Skinport;
      const rowsByWear = Array.isArray(skinportSnapshot?.quality_rows) ? skinportSnapshot.quality_rows.reduce((lookup, row) => {
        if (row?.wear) {
          lookup[row.wear] = row;
        }
        return lookup;
      }, {}) : {};
      const wears = fallback.wears.map((row) => {
        const liveRow = rowsByWear[row.wear];
        return liveRow ? {
          ...row,
          best_price: Number(liveRow.min_price ?? liveRow.price ?? row.best_price),
          stock: Number(liveRow.quantity ?? row.stock)
        } : row;
      });
      const factoryNew = rowsByWear["Factory New"];
      const totalStock = Object.values(rowsByWear).reduce((sum, row) => sum + Number(row?.quantity || 0), 0);
      return {
        ...fallback,
        best_price: factoryNew ? Number(factoryNew.min_price ?? factoryNew.price ?? fallback.best_price) : fallback.best_price,
        total_stock: totalStock || fallback.total_stock,
        wears
      };
    }
    function parseNumericDisplay(value) {
      const number = Number(String(value ?? "").replace(/[^0-9.-]+/g, ""));
      return Number.isFinite(number) ? number : 0;
    }
    function buildAzureListingsData(selectedMarket, marketRowsData, distributionData, qualityRows) {
      const canonical = canonicalMarketName(selectedMarket);
      const fallback = LISTING_FALLBACKS[selectedMarket] || LISTING_FALLBACKS[canonical] || LISTING_FALLBACKS.CSFloat;
      const marketRow = (Array.isArray(marketRowsData) ? marketRowsData : []).find((row) => row && (row.name === selectedMarket || canonicalMarketName(row.name) === canonical)) || null;
      const distributionEntry = (Array.isArray(distributionData) ? distributionData : []).find((entry) => entry && (entry.marketplace === selectedMarket || canonicalMarketName(entry.marketplace) === canonical)) || null;
      const liveQualityRows = Array.isArray(qualityRows) ? qualityRows : [];
      const qualityLookup = liveQualityRows.reduce((lookup, row) => {
        if (row?.wear) {
          lookup[row.wear] = row;
        }
        return lookup;
      }, {});
      const bestPrice = Number(
        distributionEntry?.avg_price || parseNumericDisplay(marketRow?.basePrice) || Number(qualityLookup["Factory New"]?.price || 0) || 0
      );
      const feePct = Number(parseNumericDisplay(marketRow?.fee) || fallback.fee_pct || 0);
      const totalStock = Math.max(0, Math.round(Number(distributionEntry?.volume || 0)));
      const fallbackWears = Array.isArray(fallback.wears) && fallback.wears.length ? fallback.wears : QUALITY_ROWS.map((row) => ({ wear: row.wear, best_price: bestPrice, stock: 0 }));
      const fallbackWearTotal = fallbackWears.reduce((sum, row) => sum + Number(row.stock || 0), 0) || fallbackWears.length || 1;
      const wears = fallbackWears.map((row, index) => {
        const qualityRow = qualityLookup[row.wear] || null;
        const qualityPrice = Number(qualityRow?.price || 0);
        const baseStock = Number(row.stock || 0);
        const proportionalStock = totalStock > 0 ? Math.max(1, Math.round(baseStock / fallbackWearTotal * totalStock)) : 0;
        return {
          wear: row.wear,
          best_price: Number((qualityPrice || (index === 0 ? bestPrice : Number(row.best_price || bestPrice))).toFixed(2)),
          stock: proportionalStock
        };
      });
      if (totalStock > 0 && wears.length) {
        const stockDelta = totalStock - wears.reduce((sum, row) => sum + Number(row.stock || 0), 0);
        wears[0].stock = Math.max(1, Number(wears[0].stock || 0) + stockDelta);
      }
      return {
        ...fallback,
        best_price: Number(bestPrice.toFixed(2)),
        fee_pct: Number(feePct.toFixed(2)),
        total_stock: totalStock,
        trend_pct: 0,
        wears
      };
    }
    function computeTrend(prices, lookback) {
      if (!prices.length) return 0;
      const end = prices[prices.length - 1];
      const startIndex = Math.max(0, prices.length - 1 - lookback);
      const start = prices[startIndex] || end;
      if (!start) return 0;
      return (end - start) / start * 100;
    }
    function normalizeAnalyticsSeriesPoints(points) {
      if (!Array.isArray(points)) return [];
      return points.map((point) => ({
        date: parseChartPointDateKey(point?.date),
        price: Number(point?.price || 0),
        volume: Number(point?.volume || 0),
        synthetic: Boolean(point?.synthetic)
      })).filter((point) => point.date && Number.isFinite(point.price)).sort((left, right) => left.date.localeCompare(right.date));
    }
    function computeSeriesTrendByDays(points, daysBack) {
      const normalized = normalizeAnalyticsSeriesPoints(points);
      if (!normalized.length) return 0;
      const endPoint = normalized[normalized.length - 1];
      const endDate = new Date(endPoint.date);
      if (Number.isNaN(endDate.getTime())) {
        return 0;
      }
      const targetTimestamp = endDate.getTime() - daysBack * 24 * 60 * 60 * 1e3;
      let baseline = normalized[0];
      for (let index = normalized.length - 1; index >= 0; index -= 1) {
        const candidateDate = new Date(normalized[index].date);
        if (!Number.isNaN(candidateDate.getTime()) && candidateDate.getTime() <= targetTimestamp) {
          baseline = normalized[index];
          break;
        }
      }
      if (!baseline?.price) return 0;
      return (endPoint.price - baseline.price) / baseline.price * 100;
    }
    function computeSeriesRangeTrend(points) {
      const normalized = normalizeAnalyticsSeriesPoints(points);
      if (normalized.length < 2) return 0;
      const start = normalized[0].price;
      const end = normalized[normalized.length - 1].price;
      if (!start) return 0;
      return (end - start) / start * 100;
    }
    function resolveAnalyticsSeries(bundle, sourceId) {
      if (!bundle?.series) return null;
      if (sourceId && sourceId !== "all") {
        return bundle.series[sourceId] || null;
      }
      return bundle.series[sourceId] || bundle.series.steam || bundle.series.all || null;
    }
    function buildAnalyticsSubtitle(series, title, wear) {
      const points = normalizeAnalyticsSeriesPoints(series?.points || []);
      if (!points.length) {
        return `${series?.label || "Market"} history is loading for ${title} (${wear}).`;
      }
      const includeTime = hasIntradaySnapshots(points);
      return `${series?.label || "Market"} real price history for ${title} (${wear}) from ${formatHistoryAxisLabel(points[0].date, includeTime)} to ${formatHistoryAxisLabel(points[points.length - 1].date, includeTime)}.`;
    }
    function buildMainChartVolumeColors(points, sourceId = "steam") {
      const theme = ANALYTICS_SOURCE_THEME[sourceId] || ANALYTICS_SOURCE_THEME.steam;
      return points.map((point, index) => {
        const previous = index > 0 ? points[index - 1]?.price : point.price;
        return point.price >= previous ? theme.volumeUp : theme.volumeDown;
      });
    }
    function buildVolumeMovingAverage(points, windowSize = 8) {
      const rows = normalizeAnalyticsSeriesPoints(points);
      return rows.map((point, index) => {
        const startIndex = Math.max(0, index - windowSize + 1);
        const slice = rows.slice(startIndex, index + 1);
        const average = slice.reduce((sum, entry) => sum + Number(entry.volume || 0), 0) / Math.max(1, slice.length);
        return Number(average.toFixed(2));
      });
    }
    function formatUpdatedAt(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "Live refresh";
      }
      return date.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    const analyticsLatestMarkerPlugin = {
      id: "analyticsLatestMarker",
      afterDatasetsDraw(chart) {
        const lineIndex = chart.data.datasets.findIndex((dataset) => dataset.type === "line");
        if (lineIndex === -1) return;
        const meta = chart.getDatasetMeta(lineIndex);
        const point = meta.data[meta.data.length - 1];
        const value = chart.data.datasets[lineIndex]?.data?.[chart.data.datasets[lineIndex].data.length - 1];
        if (!point || !Number.isFinite(Number(value))) return;
        const context = chart.ctx;
        const area = chart.chartArea;
        const label = formatPrice(value);
        context.save();
        context.font = "700 12px Inter, sans-serif";
        const textWidth = context.measureText(label).width;
        const pillWidth = textWidth + 18;
        const pillHeight = 28;
        const x = Math.min(point.x + 14, area.right - pillWidth - 4);
        const y = Math.max(area.top + 6, Math.min(point.y - pillHeight - 8, area.bottom - pillHeight - 6));
        context.fillStyle = "#3777ff";
        context.beginPath();
        context.roundRect(x, y, pillWidth, pillHeight, 10);
        context.fill();
        context.fillStyle = "#f8fafc";
        context.textBaseline = "middle";
        context.fillText(label, x + 9, y + pillHeight / 2);
        context.fillStyle = "#60a5fa";
        context.beginPath();
        context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = "#dbeafe";
        context.stroke();
        context.restore();
      }
    };
    function ensureAnalyticsChartPlugins() {
      if (!window.Chart || window.__CS2AnalyticsChartsReady) {
        return;
      }
      if (window.ChartZoom) {
        try {
          window.Chart.register(window.ChartZoom);
        } catch (_error) {
        }
      }
      window.__CS2AnalyticsChartsReady = true;
    }
    function drawRoundedRect(context, x, y, width, height, radius) {
      context.beginPath();
      context.moveTo(x + radius, y);
      context.lineTo(x + width - radius, y);
      context.quadraticCurveTo(x + width, y, x + width, y + radius);
      context.lineTo(x + width, y + height - radius);
      context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      context.lineTo(x + radius, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - radius);
      context.lineTo(x, y + radius);
      context.quadraticCurveTo(x, y, x + radius, y);
      context.closePath();
    }
    function buildVolumeColors(prices) {
      return prices.map((price, index) => {
        if (index === 0) return "rgba(94, 109, 136, 0.52)";
        return price >= prices[index - 1] ? "rgba(34, 197, 94, 0.6)" : "rgba(239, 68, 68, 0.58)";
      });
    }
    function pctSeriesFromPrices(rows) {
      if (!Array.isArray(rows) || !rows.length) return [];
      const first = Number(rows[0].price) || 1;
      return rows.map((row) => Number(((Number(row.price) - first) / first * 100).toFixed(2)));
    }
    function buildProviderOrderPanels(distributionData, dynamicQuotes = {}, anchorPrice = 0) {
      const quotes = dynamicQuotes && typeof dynamicQuotes === "object" ? dynamicQuotes : {};
      const quoteByMarket = {
        Steam: quotes.steam || null,
        Skinport: quotes.skinport || null,
        CSFloat: quotes.csfloat || null,
        "White.Market": quotes.white_market || null,
        DMarket: quotes.dmarket || null,
        "Market.CSGO": quotes.market_csgo || null,
        ShadowPay: quotes.shadowpay || null,
        Waxpeer: quotes.waxpeer || null,
        "Mannco.store": quotes.mannco || null,
        HaloSkins: quotes.haloskins || null,
        RapidSkins: quotes.rapidskins || null
      };
      const entries = (Array.isArray(distributionData) ? distributionData : []).filter((entry) => entry && entry.marketplace && entry.marketplace !== "Other" && Number(entry.volume) > 0).map((entry) => {
        const canonical = canonicalMarketName(entry.marketplace);
        const quote = quoteByMarket[canonical] || quoteByMarket[entry.marketplace] || null;
        const livePrice = positivePrice(quote?.price) || positivePrice(entry.avg_price) || 0;
        return {
          ...entry,
          canonical,
          volume: Math.max(1, Math.round(Number(entry.volume) || 0)),
          refPrice: livePrice || positivePrice(LISTING_FALLBACKS[canonical]?.best_price) || positivePrice(LISTING_FALLBACKS[entry.marketplace]?.best_price) || positivePrice(anchorPrice) || 0,
          buyOrderPrice: positivePrice(quote?.buy_order_price),
          buyOrderCount: Math.max(0, Math.round(Number(quote?.buy_order_listings || quote?.buy_orders || 0) || 0))
        };
      }).filter((entry) => entry.refPrice > 0);
      const resolveByPriority = (priority, count, fallbackSorter) => {
        const picked = priority.map((name) => entries.find((entry) => entry.canonical === name || entry.marketplace === name)).filter(Boolean);
        const seen = new Set(picked.map((entry) => entry.marketplace));
        const fill = [...entries].filter((entry) => !seen.has(entry.marketplace)).sort(fallbackSorter).slice(0, Math.max(0, count - picked.length));
        return [...picked, ...fill].slice(0, count);
      };
      const sellEntries = resolveByPriority(
        ["Steam", "Skinport", "CSFloat", "White.Market", "DMarket", ...SELL_ORDER_PRIORITY],
        Math.min(5, Math.max(entries.length, 1)),
        (left, right) => left.refPrice - right.refPrice || right.volume - left.volume
      ).sort((left, right) => left.refPrice - right.refPrice || right.volume - left.volume);
      const lowestSell = sellEntries.length ? Math.min(...sellEntries.map((entry) => entry.refPrice)) : positivePrice(anchorPrice) || 0;
      const buyCandidates = resolveByPriority(
        BUY_ORDER_PRIORITY,
        Math.min(3, entries.length),
        (left, right) => (right.buyOrderPrice || 0) - (left.buyOrderPrice || 0) || left.refPrice - right.refPrice
      );
      const buyEntries = buyCandidates.map((entry, index) => {
        const realBuy = entry.buyOrderPrice;
        const estimatedBuy = lowestSell > 0 ? Number((lowestSell * (0.92 - index * 0.08)).toFixed(2)) : Number(Math.max(0.01, entry.refPrice * (0.88 - index * 0.08)).toFixed(2));
        const price = realBuy || estimatedBuy;
        const count = entry.buyOrderCount > 0 ? entry.buyOrderCount : Math.max(1, Math.round(entry.volume * (index === 0 ? 0.12 : index === 1 ? 0.05 : 0.02)));
        return {
          ...entry,
          price,
          count
        };
      }).sort((left, right) => right.price - left.price || right.count - left.count);
      const sell = sellEntries.map((entry) => ({
        ...entry,
        price: entry.refPrice,
        count: entry.volume
      }));
      return { buy: buyEntries, sell };
    }
    function buildUniversalOrderBook(rows, range, totalSupply = 0, anchorPrice = 0, orderPanels = null) {
      const buyLevels = Array.isArray(orderPanels?.buy) ? orderPanels.buy.filter((row) => Number(row.price) > 0 && Number(row.count) > 0) : [];
      const sellLevels = Array.isArray(orderPanels?.sell) ? orderPanels.sell.filter((row) => Number(row.price) > 0 && Number(row.count) > 0) : [];
      if (buyLevels.length || sellLevels.length) {
        const buyOrders2 = Math.max(1, buyLevels.reduce((sum, row) => sum + Math.round(Number(row.count) || 0), 0));
        const sellOrders2 = Math.max(1, sellLevels.reduce((sum, row) => sum + Math.round(Number(row.count) || 0), 0));
        const highestBuy2 = buyLevels.length ? Math.max(...buyLevels.map((row) => Number(row.price))) : sellLevels.length ? Number((Math.min(...sellLevels.map((row) => Number(row.price))) * 0.92).toFixed(2)) : Number(anchorPrice) || 0;
        const lowestSell2 = sellLevels.length ? Math.min(...sellLevels.map((row) => Number(row.price))) : Number((highestBuy2 * 1.08).toFixed(2));
        const deepestBuy = buyLevels.length ? Math.min(...buyLevels.map((row) => Number(row.price))) : highestBuy2;
        const highestSell = sellLevels.length ? Math.max(...sellLevels.map((row) => Number(row.price))) : lowestSell2;
        const cashSpread2 = Number(Math.max(0.01, lowestSell2 - highestBuy2).toFixed(2));
        const steamBuy = buyLevels.find((row) => canonicalMarketName(row.marketplace) === "Steam");
        const steamSell = sellLevels.find((row) => canonicalMarketName(row.marketplace) === "Steam");
        const steamSpread2 = steamBuy && steamSell ? Number(Math.max(0.01, Number(steamSell.price) - Number(steamBuy.price)).toFixed(2)) : Number((cashSpread2 * 1.35).toFixed(2));
        const pad = Math.max(cashSpread2 * 0.08, Math.max(highestSell, highestBuy2) * 0.01, 0.05);
        const minDepth = Number((deepestBuy - pad).toFixed(2));
        const maxDepth = Number((highestSell + pad).toFixed(2));
        const buySorted = [...buyLevels].sort((left, right) => Number(left.price) - Number(right.price));
        const sellSorted = [...sellLevels].sort((left, right) => Number(left.price) - Number(right.price));
        const buySeries2 = [];
        let buyCum = 0;
        buySorted.forEach((level, index) => {
          const price = Number(level.price);
          if (index === 0) {
            buySeries2.push({ x: -buyOrders2, y: price });
          }
          buySeries2.push({ x: -buyOrders2 + buyCum, y: price });
          buyCum += Math.round(Number(level.count) || 0);
          buySeries2.push({ x: -buyOrders2 + buyCum, y: price });
        });
        if (buySeries2.length) {
          buySeries2.push({ x: 0, y: highestBuy2 });
        }
        const sellSeries2 = [];
        let sellCum = 0;
        sellSorted.forEach((level, index) => {
          const price = Number(level.price);
          if (index === 0) {
            sellSeries2.push({ x: 0, y: price });
          }
          sellSeries2.push({ x: sellCum, y: price });
          sellCum += Math.round(Number(level.count) || 0);
          sellSeries2.push({ x: sellCum, y: price });
        });
        return {
          badgeCount: buySeries2.length + sellSeries2.length,
          buyOrders: buyOrders2,
          buySeries: buySeries2,
          cashSpread: cashSpread2,
          highestBuy: Number(highestBuy2.toFixed(2)),
          lowestSell: Number(lowestSell2.toFixed(2)),
          maxDepth,
          minDepth,
          sellOrders: sellOrders2,
          sellSeries: sellSeries2,
          steamSpread: steamSpread2,
          xMax: sellOrders2,
          xMin: -buyOrders2
        };
      }
      const points = Array.isArray(rows) ? rows : [];
      const prices = points.map((row) => Number(row.price)).filter((value) => Number.isFinite(value) && value > 0);
      const safeAnchor = Number.isFinite(Number(anchorPrice)) && Number(anchorPrice) > 0 ? Number(anchorPrice) : 0;
      const latest = prices.length ? prices[prices.length - 1] : safeAnchor || 153.69;
      const lowest = prices.length ? Math.min(...prices) : latest * 0.96;
      const highest = prices.length ? Math.max(...prices) : latest * 1.04;
      const swing = Math.max(highest - lowest, latest * 0.014);
      const rangeFactor = { "1M": 1, "6M": 1.24, "1Y": 1.52 }[range] || 1;
      const cashSpread = Number((Math.max(0.74, swing * 0.22 + latest * 38e-4) * rangeFactor).toFixed(2));
      const steamSpread = Number((cashSpread * 1.62).toFixed(2));
      const highestBuy = Number((latest - cashSpread / 2).toFixed(2));
      const lowestSell = Number((latest + cashSpread / 2).toFixed(2));
      const normalizedSupply = Math.max(Number(totalSupply) || 0, 650);
      const buyOrders = Math.round(Math.max(98, normalizedSupply * 0.015) * (range === "1Y" ? 1.08 : range === "6M" ? 1.03 : 1));
      const sellOrders = Math.round(Math.max(755, normalizedSupply * 0.418) * (range === "1Y" ? 1.16 : range === "6M" ? 1.08 : 1));
      const buySteps = range === "1Y" ? 11 : 9;
      const sellSteps = range === "1Y" ? 12 : 10;
      const sellWidth = cashSpread * 2.6;
      const pivotPrice = Number(((highestBuy + lowestSell) / 2).toFixed(2));
      const visualFloor = Number((highestBuy - Math.max(cashSpread * 0.85, latest * 0.02)).toFixed(2));
      const visualCeiling = Number((lowestSell + Math.max(sellWidth * 0.55, latest * 0.04 * rangeFactor)).toFixed(2));
      const buySeries = Array.from({ length: buySteps }, (_, index) => {
        const progress = index / (buySteps - 1 || 1);
        return {
          x: Math.round(-buyOrders + buyOrders * progress),
          y: Number((visualFloor + (highestBuy - visualFloor) * Math.pow(progress, 0.72)).toFixed(2))
        };
      });
      const sellSeries = Array.from({ length: sellSteps }, (_, index) => {
        const progress = index / (sellSteps - 1 || 1);
        return {
          x: Math.round(sellOrders * progress),
          y: Number((lowestSell + (visualCeiling - lowestSell) * Math.pow(progress, 1.15)).toFixed(2))
        };
      });
      return {
        badgeCount: buySeries.length + sellSeries.length,
        buyOrders,
        buySeries,
        cashSpread,
        highestBuy,
        lowestSell,
        maxDepth: visualCeiling,
        minDepth: visualFloor,
        sellOrders,
        sellSeries,
        steamSpread,
        xMax: sellOrders,
        xMin: -buyOrders
      };
    }
    function buildOrderBookSvgPaths(orderBook, width = 760, height = 340) {
      const pad = { left: 58, right: 30, top: 28, bottom: 42 };
      const innerWidth = width - pad.left - pad.right;
      const innerHeight = height - pad.top - pad.bottom;
      const buyOrders = Math.max(1, Math.abs(Number(orderBook.xMin || 0)));
      const sellOrders = Math.max(1, Number(orderBook.xMax || 0));
      const yMin = Number(orderBook.minDepth || 0);
      const yMax = Number(orderBook.maxDepth || 1);
      const yRange = Math.max(0.01, yMax - yMin);
      const halfWidth = innerWidth * 0.5;
      const pivotX = Number((pad.left + halfWidth).toFixed(2));
      const mapBuyX = (value) => {
        const depth = Math.max(0, Number(value) + buyOrders);
        return Number((pad.left + depth / buyOrders * halfWidth).toFixed(2));
      };
      const mapSellX = (value) => {
        const depth = Math.max(0, Number(value));
        return Number((pivotX + depth / sellOrders * halfWidth).toFixed(2));
      };
      const mapY = (value) => Number((pad.top + innerHeight - (Number(value) - yMin) / yRange * innerHeight).toFixed(2));
      const linePath = (points, mapX) => points.map((point, index) => `${index === 0 ? "M" : "L"} ${mapX(point.x)} ${mapY(point.y)}`).join(" ");
      const baseline = mapY(yMin);
      const buyLine = linePath(orderBook.buySeries || [], mapBuyX);
      const sellLine = linePath(orderBook.sellSeries || [], mapSellX);
      const yTicks = [0.18, 0.48, 0.78].map((ratio) => {
        const value = yMin + yRange * ratio;
        return { y: mapY(value), label: formatPrice(value) };
      });
      return {
        width,
        height,
        baseline,
        pivotX,
        buyLine,
        buyArea: buyLine ? `${buyLine} L ${pivotX} ${baseline} L ${pad.left} ${baseline} Z` : "",
        sellLine,
        sellArea: sellLine ? `${sellLine} L ${pad.left + innerWidth} ${baseline} L ${pivotX} ${baseline} Z` : "",
        yTicks,
        pad,
        innerWidth,
        innerHeight,
        buyOrders,
        sellOrders,
        yMin,
        yMax,
        mapBuyX,
        mapSellX,
        mapY
      };
    }
    function interpolateOrderBookSeriesByX(series, targetX) {
      const points = Array.isArray(series) ? series : [];
      if (!points.length) return null;
      const x = Number(targetX);
      if (!Number.isFinite(x)) return null;
      if (x <= Number(points[0].x)) return points[0];
      const last = points[points.length - 1];
      if (x >= Number(last.x)) return last;
      for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        const startX = Number(start.x);
        const endX = Number(end.x);
        if (x < startX || x > endX) continue;
        const span = endX - startX || 1;
        const ratio = (x - startX) / span;
        return {
          x,
          y: Number((Number(start.y) + (Number(end.y) - Number(start.y)) * ratio).toFixed(2))
        };
      }
      return last;
    }
    function svgPointFromMouseEvent(svg, event) {
      if (!svg || !event) return null;
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const viewBox = svg.viewBox?.baseVal;
      const viewWidth = viewBox?.width || rect.width;
      const viewHeight = viewBox?.height || rect.height;
      return {
        x: (event.clientX - rect.left) / rect.width * viewWidth,
        y: (event.clientY - rect.top) / rect.height * viewHeight
      };
    }
    function resolveOrderBookHover(orderBook, layout, svgX, svgY) {
      if (!orderBook || !layout) return null;
      const {
        pad,
        width,
        height,
        innerWidth,
        pivotX,
        buyOrders,
        sellOrders,
        mapBuyX,
        mapSellX,
        mapY
      } = layout;
      if (!Number.isFinite(svgX) || !Number.isFinite(svgY) || svgX < pad.left || svgX > width - pad.right || svgY < pad.top || svgY > height - pad.bottom) {
        return null;
      }
      const halfWidth = innerWidth * 0.5;
      const onBuySide = svgX <= pivotX;
      const buyDepth = onBuySide ? Math.max(0, Math.min(buyOrders, (svgX - pad.left) / Math.max(1, halfWidth) * buyOrders)) : 0;
      const sellDepth = onBuySide ? 0 : Math.max(0, Math.min(sellOrders, (svgX - pivotX) / Math.max(1, halfWidth) * sellOrders));
      const dataX = onBuySide ? buyDepth - buyOrders : sellDepth;
      const point = interpolateOrderBookSeriesByX(
        onBuySide ? orderBook.buySeries : orderBook.sellSeries,
        dataX
      );
      if (!point) return null;
      const depth = onBuySide ? Math.round(buyDepth) : Math.round(sellDepth);
      const pointSvgX = onBuySide ? mapBuyX(point.x) : mapSellX(point.x);
      return {
        side: onBuySide ? "buy" : "sell",
        label: onBuySide ? "Buy Orders" : "Sell Orders",
        price: Number(point.y),
        depth,
        svgX: pointSvgX,
        svgY: mapY(point.y),
        pivotX,
        tipLeftPct: pointSvgX / width * 100,
        tipTopPct: mapY(point.y) / height * 100
      };
    }
    function buildRegionalMarketShare(distributionData) {
      const entries = (Array.isArray(distributionData) ? distributionData : []).filter((entry) => entry && entry.marketplace && entry.marketplace !== "Other" && Number(entry.volume) > 0).map((entry) => ({
        ...entry,
        canonical: canonicalMarketName(entry.marketplace),
        region: getMarketplaceMeta(entry.marketplace).region || "west"
      }));
      const eastEntries = entries.filter((entry) => entry.region === "east");
      const westEntries = entries.filter((entry) => entry.region !== "east");
      const eastVolume = eastEntries.reduce((sum, entry) => sum + Number(entry.volume || 0), 0);
      const westVolume = westEntries.reduce((sum, entry) => sum + Number(entry.volume || 0), 0);
      const total = Math.max(1, eastVolume + westVolume);
      const eastPct = Number((eastVolume / total * 100).toFixed(1));
      const westPct = Number((100 - eastPct).toFixed(1));
      return {
        eastEntries,
        eastPct,
        westEntries,
        westPct
      };
    }
    function MarketplaceBadge({ name, compact = false }) {
      const meta = getMarketplaceMeta(name);
      const style = { "--badge-accent": marketColor(name) };
      return /* @__PURE__ */ React.createElement("span", { className: classNames("marketplace-badge", compact && "compact", !meta.image && "fallback"), style }, meta.image ? /* @__PURE__ */ React.createElement("img", { src: meta.image, alt: "", loading: "lazy" }) : meta.short);
    }
    const PAYMENT_METHOD_META = {
      card: { label: "Bank card", icon: "fa-solid fa-credit-card" },
      paypal: { label: "PayPal", icon: "fa-brands fa-paypal" },
      crypto: { label: "Crypto", icon: "fa-solid fa-coins" },
      bank: { label: "Bank transfer", icon: "fa-solid fa-building-columns" }
    };
    function MarketPaymentIcons({ name }) {
      const { t } = useI18n();
      const meta = getMarketplaceMeta(name);
      const payments = Array.isArray(meta.payments) ? meta.payments : [];
      if (!payments.length && !meta.kyc) return null;
      return /* @__PURE__ */ React.createElement("span", { className: "tv-market-payment-icons" }, payments.map(function(key) {
        const pm = PAYMENT_METHOD_META[key];
        if (!pm) return null;
        return /* @__PURE__ */ React.createElement("i", { key, className: pm.icon, title: pm.label, "aria-label": pm.label });
      }), meta.kyc ? /* @__PURE__ */ React.createElement("span", { className: "tv-market-kyc-tag", title: t("item_kycRequired") }, t("item_kyc")) : null);
    }
    function FullscreenButton({ active, label, onClick }) {
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: `chart-fullscreen-btn${active ? " active" : ""}`,
          "aria-label": active ? `Exit fullscreen for ${label}` : `Open ${label} in fullscreen`,
          title: active ? "Exit fullscreen" : "Open fullscreen",
          onClick
        },
        /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${active ? "fa-compress" : "fa-expand"}` })
      );
    }
    function providerHistoryDayStride(range) {
      const rangeKey = String(range || "").toUpperCase();
      if (isLifetimeProviderRange(rangeKey)) return 5;
      if (rangeKey === "1Y") return 3;
      if (rangeKey === "180D") return 2;
      return 0;
    }
    function resolveReleaseSinceIso(itemDetails, fallbackLabel = "") {
      const raw = String(itemDetails?.added || "").trim() || String(fallbackLabel || "").trim();
      if (!raw) return "";
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return "";
      const yyyy = String(parsed.getUTCFullYear());
      const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(parsed.getUTCDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
    function downsampleProviderDateKeys(dateKeys, stride, intraday = false) {
      if (!stride || stride <= 1 || !Array.isArray(dateKeys) || dateKeys.length <= stride + 1) {
        return dateKeys;
      }
      const entries = dateKeys.map((key) => {
        const raw = String(key || "");
        const datePart = raw.slice(0, 10);
        const time = Date.parse(intraday ? raw.replace(" ", "T") : `${datePart}T00:00:00Z`);
        return { key, time };
      }).filter((entry) => Number.isFinite(entry.time));
      if (entries.length <= stride + 1) {
        return dateKeys;
      }
      const msPerDay = 864e5;
      const origin = entries[0].time;
      const bucketLast = /* @__PURE__ */ new Map();
      entries.forEach((entry) => {
        const dayOffset = Math.floor((entry.time - origin) / msPerDay);
        const bucket = Math.floor(dayOffset / stride);
        bucketLast.set(bucket, entry);
      });
      const latest = entries[entries.length - 1];
      const latestBucket = Math.floor((latest.time - origin) / msPerDay / stride);
      bucketLast.set(latestBucket, latest);
      return Array.from(bucketLast.values()).sort((left, right) => left.time - right.time).map((entry) => entry.key);
    }
    function smoothProviderChartValues(values, windowSize = 3) {
      if (!Array.isArray(values) || values.length < 3 || windowSize < 2) {
        return values;
      }
      const half = Math.floor(windowSize / 2);
      return values.map((value, index) => {
        if (!Number.isFinite(value) || value <= 0) {
          return value;
        }
        const slice = [];
        for (let offset = -half; offset <= half; offset += 1) {
          const sample = values[index + offset];
          if (Number.isFinite(sample) && sample > 0) {
            slice.push(sample);
          }
        }
        if (!slice.length) {
          return value;
        }
        const smoothed = slice.reduce((sum, sample) => sum + sample, 0) / slice.length;
        return Number(smoothed.toFixed(4));
      });
    }
    function mapProviderPricesOntoAxis(providerPoints, axisKeys, maxGapDays = 21) {
      const points = normalizeAnalyticsSeriesPoints(providerPoints).map((point) => ({
        key: String(point.date || "").slice(0, 10),
        price: Number(point.price),
        time: Date.parse(`${String(point.date || "").slice(0, 10)}T00:00:00Z`)
      })).filter((point) => point.key && Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.time)).sort((left, right) => left.time - right.time);
      if (!points.length) {
        return axisKeys.map(() => null);
      }
      let cursor = 0;
      let lastPrice = null;
      let lastTime = null;
      const maxGapMs = Math.max(1, maxGapDays) * 864e5;
      const lastSampleTime = points[points.length - 1].time;
      return axisKeys.map((rawKey) => {
        const key = String(rawKey || "").slice(0, 10);
        const time = Date.parse(`${key}T00:00:00Z`);
        if (!Number.isFinite(time)) {
          return null;
        }
        while (cursor < points.length && points[cursor].time <= time) {
          lastPrice = points[cursor].price;
          lastTime = points[cursor].time;
          cursor += 1;
        }
        if (lastPrice != null && time >= lastSampleTime) {
          return lastPrice;
        }
        if (lastPrice != null && lastTime != null && time - lastTime <= maxGapMs) {
          return lastPrice;
        }
        const next = points[cursor];
        if (next && next.time - time <= maxGapMs) {
          return next.price;
        }
        return null;
      });
    }
    function resolveProviderSeries(range, remoteProviders) {
      if (remoteProviders === void 0) {
        return null;
      }
      if (Array.isArray(remoteProviders) && remoteProviders.length) {
        const normalizedProviders = remoteProviders.map((provider) => ({
          name: provider?.name || "Provider",
          color: PROVIDER_COLORS[provider?.name] || marketColor(provider?.name) || "#38bdf8",
          points: filterProviderPointsByRange(provider?.points || [], range)
        })).filter((provider) => provider.points.length >= 2);
        if (!normalizedProviders.length) {
          return {
            labels: [],
            providers: []
          };
        }
        const intraday = normalizedProviders.some((provider) => hasIntradaySnapshots(provider.points));
        const isLifetimeRange = isLifetimeProviderRange(range);
        const steamTimeline = normalizedProviders.find((provider) => String(provider.name || "").toLowerCase() === "steam" && provider.points.length >= 2);
        const dateKeys = isLifetimeRange ? Array.from(new Set(
          normalizedProviders.flatMap((provider) => provider.points.map((point) => String(point.date || "").slice(0, intraday ? 16 : 10)))
        )).filter(Boolean).sort() : steamTimeline ? steamTimeline.points.map((point) => String(point.date || "").slice(0, intraday ? 16 : 10)) : Array.from(new Set(
          normalizedProviders.flatMap((provider) => provider.points.map((point) => String(point.date || "").slice(0, intraday ? 16 : 10)))
        )).filter(Boolean).sort();
        const timelineSource = isLifetimeRange && steamTimeline ? steamTimeline.points.map((point) => String(point.date || "").slice(0, intraday ? 16 : 10)) : dateKeys;
        const axisKeys = downsampleProviderDateKeys(
          timelineSource.length >= 2 ? timelineSource : dateKeys,
          providerHistoryDayStride(range),
          intraday
        );
        const axisIncludeYear = historyAxisNeedsYear(axisKeys, range);
        const axisLabels = axisKeys.map((date) => formatHistoryAxisLabel(date, intraday, axisIncludeYear));
        const axisCoverageFloor = Math.max(3, Math.min(8, Math.ceil(axisKeys.length * 0.12)));
        const maxGapDays = isLifetimeRange ? 45 : ["1Y", "180D", "90D"].includes(String(range || "").toUpperCase()) ? 75 : 28;
        return {
          labels: axisLabels,
          providers: normalizedProviders.map((provider) => {
            const values = mapProviderPricesOntoAxis(
              provider.points,
              axisKeys,
              maxGapDays
            );
            const coverage = values.filter((value) => Number.isFinite(value) && value > 0).length;
            return {
              name: provider.name,
              color: provider.color,
              values,
              sparse: coverage < axisCoverageFloor
            };
          }).filter((provider) => provider.values.filter((value) => Number.isFinite(value) && value > 0).length >= 2)
        };
      }
      return {
        labels: [],
        providers: []
      };
    }
    function latestRemoteProviderPrice(remoteProviders, providerName) {
      if (!Array.isArray(remoteProviders)) {
        return null;
      }
      const provider = remoteProviders.find((entry) => String(entry?.name || "").toLowerCase() === String(providerName || "").toLowerCase());
      if (!provider) {
        return null;
      }
      const points = normalizeAnalyticsSeriesPoints(provider.points || []);
      for (let index = points.length - 1; index >= 0; index -= 1) {
        const price = Number(points[index]?.price || 0);
        if (Number.isFinite(price) && price > 0) {
          return price;
        }
      }
      return null;
    }
    function latestRemoteProviderVolume(remoteProviders, providerName) {
      if (!Array.isArray(remoteProviders)) {
        return null;
      }
      const provider = remoteProviders.find((entry) => String(entry?.name || "").toLowerCase() === String(providerName || "").toLowerCase());
      if (!provider) {
        return null;
      }
      const points = normalizeAnalyticsSeriesPoints(provider.points || []);
      for (let index = points.length - 1; index >= 0; index -= 1) {
        const volume = Number(points[index]?.volume || 0);
        if (Number.isFinite(volume) && volume > 0) {
          return volume;
        }
      }
      return null;
    }
    function providerSeriesFromBundle(bundle, wear = DEFAULT_WEAR, itemName = "") {
      const series = bundle?.series || {};
      return Object.values(series).filter((entry) => entry && entry.id !== "all").map((entry) => ({
        name: entry.label || sourceMarketplaceLabel(entry.id) || "Provider",
        current_price: positivePrice(entry.current_price),
        points: normalizeAnalyticsSeriesPoints(entry.points || []).map((point) => ({
          date: point.date,
          price: Number(point.price),
          volume: Number(point.volume || 0)
        })).filter((point) => Number.isFinite(point.price) && point.price > 0)
      })).filter((entry) => entry.points.length >= 2);
    }
    function sanitizeRemoteProviders(providers, referencePrice, itemName = "") {
      const steamEntry = (Array.isArray(providers) ? providers : []).find((entry) => String(entry?.name || "").toLowerCase() === "steam");
      const steamPoints = normalizeAnalyticsSeriesPoints(steamEntry?.points || []);
      const steamReference = positivePrice(steamEntry?.current_price) || positivePrice(steamPoints[steamPoints.length - 1]?.price) || providerHistoryReferencePrice(providers) || referencePrice;
      const flatItem = isFlatMarketItem(itemName);
      const band = providerOutlierBand(true, flatItem);
      return (Array.isArray(providers) ? providers : []).map((entry) => {
        const isSteam = String(entry?.name || "").toLowerCase() === "steam";
        const normalized = normalizeAnalyticsSeriesPoints(entry?.points || []).map((point) => ({
          date: point.date,
          price: Number(point.price),
          volume: Number(point.volume || 0),
          synthetic: Boolean(point.synthetic)
        })).filter((point) => Number.isFinite(point.price) && point.price > 0);
        let filtered = normalized;
        if (!isSteam) {
          const steamByDate = new Map(
            steamPoints.map((point) => [String(point.date || "").slice(0, 10), Number(point.price)])
          );
          filtered = normalized.filter((point) => {
            const key = String(point.date || "").slice(0, 10);
            const steamPrice = steamByDate.get(key);
            if (Number.isFinite(steamPrice) && steamPrice > 0) {
              const ratio = point.price / steamPrice;
              if (ratio > band.high || ratio < band.low) {
                return false;
              }
            } else if (isProviderPriceOutlier(point.price, steamReference, true, flatItem)) {
              return false;
            }
            return true;
          });
          if (filtered.length < 2) {
            filtered = filterChartSeriesOutliers(normalized, steamReference, true);
          }
          if (filtered.length < 2 && flatItem && normalized.length >= 2 && steamPoints.length >= 2) {
            const anchor = positivePrice(entry?.current_price) || positivePrice(normalized[normalized.length - 1]?.price) || 0;
            if (anchor > 0 && steamReference > 0) {
              const ratio = anchor / steamReference;
              if (ratio >= 0.2 && ratio <= 4.5) {
                filtered = shapeProviderSeriesFromSteam(steamPoints, anchor);
              }
            }
          }
        }
        return {
          name: entry?.name || "Provider",
          color: entry?.color || marketColor(entry?.name),
          current_price: entry?.current_price,
          points: filtered
        };
      }).filter((entry) => entry.points.length >= 2);
    }
    function bundleSourceSnapshot(bundle, sourceId) {
      const cards = Array.isArray(bundle?.snapshot_cards) ? bundle.snapshot_cards : [];
      return cards.find((entry) => String(entry?.id || "") === String(sourceId || "")) || null;
    }
    function bundleSourceSeries(bundle, sourceId) {
      const series = bundle?.series || {};
      const sourceSeries = series?.[sourceId];
      return sourceSeries && typeof sourceSeries === "object" ? sourceSeries : null;
    }
    function bundleSourceWearRow(bundle, sourceId, wear, itemName = "") {
      const rows = Array.isArray(bundle?.wear_prices?.[sourceId]) ? bundle.wear_prices[sourceId] : [];
      if (!rows.length) {
        return null;
      }
      if (!itemSupportsWearRows(itemName, wear)) {
        return null;
      }
      return rows.find((entry) => String(entry?.wear || "") === String(wear || "")) || null;
    }
    function bundleSourcePrice(bundle, sourceId, wear, itemName = "") {
      const wearRow = bundleSourceWearRow(bundle, sourceId, wear, itemName);
      const wearPrice = Number(wearRow?.price || 0);
      if (Number.isFinite(wearPrice) && wearPrice > 0) {
        return wearPrice;
      }
      if (itemSupportsWearRows(itemName, wear) && String(wear || "").trim() !== "") {
        return null;
      }
      const snapshot = bundleSourceSnapshot(bundle, sourceId);
      const snapshotPrice = Number(snapshot?.price || 0);
      if (Number.isFinite(snapshotPrice) && snapshotPrice > 0) {
        return snapshotPrice;
      }
      const series = bundleSourceSeries(bundle, sourceId);
      const seriesPoints = normalizeAnalyticsSeriesPoints(series?.points || []);
      const currentPrice = Number(
        series?.current_price ?? seriesPoints[seriesPoints.length - 1]?.price ?? 0
      );
      return Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null;
    }
    function bundleSourceVolume(bundle, sourceId, wear, itemName = "") {
      const wearRow = bundleSourceWearRow(bundle, sourceId, wear, itemName);
      const wearVolume = Number(wearRow?.volume || 0);
      if (Number.isFinite(wearVolume) && wearVolume > 0) {
        return wearVolume;
      }
      const snapshot = bundleSourceSnapshot(bundle, sourceId);
      const snapshotVolume = Number(snapshot?.volume || 0);
      if (Number.isFinite(snapshotVolume) && snapshotVolume > 0) {
        return snapshotVolume;
      }
      const series = bundleSourceSeries(bundle, sourceId);
      const seriesPoints = normalizeAnalyticsSeriesPoints(series?.points || []);
      const currentVolume = Number(
        series?.current_volume ?? seriesPoints[seriesPoints.length - 1]?.volume ?? 0
      );
      return Number.isFinite(currentVolume) && currentVolume > 0 ? currentVolume : null;
    }
    const latestPriceMarkerPlugin = {
      id: "latestPriceMarker",
      afterDatasetsDraw(chart) {
        const lineIndex = chart.data.datasets.findIndex((dataset) => dataset.type === "line");
        if (lineIndex === -1) return;
        const meta = chart.getDatasetMeta(lineIndex);
        const point = meta.data[meta.data.length - 1];
        if (!point) return;
        const value = chart.data.datasets[lineIndex].data[chart.data.datasets[lineIndex].data.length - 1];
        const context = chart.ctx;
        const area = chart.chartArea;
        const y = point.y;
        const label = formatPrice(value);
        context.save();
        context.setLineDash([4, 4]);
        context.strokeStyle = "rgba(59, 130, 246, 0.55)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(area.left, y);
        context.lineTo(area.right, y);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = "#3b82f6";
        context.beginPath();
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fill();
        context.font = "600 12px Segoe UI";
        const labelWidth = context.measureText(label).width + 18;
        const labelHeight = 24;
        const labelX = area.right - labelWidth - 6;
        const labelY = Math.max(area.top + 8, Math.min(area.bottom - labelHeight - 8, y - labelHeight / 2));
        context.fillStyle = "#2563eb";
        drawRoundedRect(context, labelX, labelY, labelWidth, labelHeight, 8);
        context.fill();
        context.fillStyle = "#ffffff";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(label, labelX + labelWidth / 2, labelY + labelHeight / 2 + 0.5);
        context.restore();
      }
    };
    function fallbackSupply(range) {
      const data = SUPPLY_FALLBACKS[range] || SUPPLY_FALLBACKS["1M"];
      return {
        total: data.reduce((sum, entry) => sum + entry.volume, 0),
        data
      };
    }
    function normalizeDistributionEntries(entries) {
      const byMarket = /* @__PURE__ */ new Map();
      const allowedMarkets = new Set(DISTRIBUTION_VISIBLE_MARKETS);
      (Array.isArray(entries) ? entries : []).filter((entry) => entry && entry.marketplace).forEach((entry) => {
        const volume = Number(entry.volume || 0);
        const avgPrice = Number(entry.avg_price || 0);
        const safeVolume = Number.isFinite(volume) ? volume : 0;
        const safeAvgPrice = Number.isFinite(avgPrice) ? avgPrice : 0;
        if (safeVolume <= 0) {
          return;
        }
        const canonical = canonicalMarketName(entry.marketplace);
        const marketplace = allowedMarkets.has(canonical) ? canonical : "Unknown";
        const current = byMarket.get(marketplace) || {
          marketplace,
          volume: 0,
          avg_price: 0,
          _weightedPrice: 0
        };
        current.volume += safeVolume;
        current._weightedPrice += safeAvgPrice > 0 ? safeAvgPrice * safeVolume : 0;
        byMarket.set(marketplace, current);
      });
      const total = Array.from(byMarket.values()).reduce((sum, entry) => sum + Number(entry.volume || 0), 0);
      if (total <= 0) {
        return [];
      }
      return DISTRIBUTION_VISIBLE_MARKETS.map((marketplace) => byMarket.get(marketplace)).filter(Boolean).map((entry) => ({
        marketplace: entry.marketplace,
        volume: entry.volume,
        pct: Number((entry.volume / total * 100).toFixed(2)),
        avg_price: entry.volume > 0 && entry._weightedPrice > 0 ? Number((entry._weightedPrice / entry.volume).toFixed(2)) : 0
      })).filter((entry) => entry.volume > 0);
    }
    function computeDonutCalloutLayouts(chart, entries) {
      if (!chart?.getDatasetMeta || !Array.isArray(entries) || !entries.length) {
        return [];
      }
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data?.length) {
        return [];
      }
      const totalVolume = entries.reduce((sum, row) => sum + Math.max(0, Number(row.volume || 0)), 0) || 1;
      const cx = Number(meta.data[0]?.x);
      const cy = Number(meta.data[0]?.y);
      const outerRadius = Math.max(
        ...meta.data.map((arc) => Number(arc?.outerRadius) || 0),
        0
      );
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !(outerRadius > 0)) {
        return [];
      }
      const normalizeAngle = (angle) => {
        let value = Number(angle);
        while (value < 0) value += Math.PI * 2;
        while (value >= Math.PI * 2) value -= Math.PI * 2;
        return value;
      };
      const angleDelta = (from, to) => {
        let delta = normalizeAngle(to) - normalizeAngle(from);
        if (delta < 0) delta += Math.PI * 2;
        return delta;
      };
      const pointFromAngle = (angle, radius) => ({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        angle: normalizeAngle(angle)
      });
      const anchorFromAngle = (angle) => {
        const cos = Math.cos(angle);
        if (cos > 0.18) return "left";
        if (cos < -0.18) return "right";
        return "center";
      };
      const initial = meta.data.map((arc, index) => {
        const entry = entries[index];
        if (!entry || !Number.isFinite(arc?.x) || !Number.isFinite(arc?.y)) {
          return null;
        }
        const volume = Math.max(0, Number(entry.volume || 0));
        const sharePct = volume / totalVolume * 100;
        const mid = normalizeAngle((Number(arc.startAngle) + Number(arc.endAngle)) / 2);
        const span = Math.max(0, Number(arc.endAngle) - Number(arc.startAngle));
        const crowded = sharePct < 5 || span < 0.22;
        return {
          entry,
          index,
          mid,
          span,
          sharePct,
          crowded,
          angle: mid
        };
      }).filter(Boolean);
      if (!initial.length) {
        return [];
      }
      const anchors = initial.filter((row) => !row.crowded).sort((left, right) => left.angle - right.angle);
      const floaters = initial.filter((row) => row.crowded).sort((left, right) => left.sharePct - right.sharePct);
      const occupied = anchors.map((row) => ({ ...row }));
      const largestGaps = (placed) => {
        const sorted = [...placed].sort((left, right) => left.angle - right.angle);
        if (!sorted.length) {
          return [{ start: 0, end: Math.PI * 2, mid: 0, size: Math.PI * 2 }];
        }
        const gaps = [];
        for (let index = 0; index < sorted.length; index += 1) {
          const current = sorted[index];
          const next = sorted[(index + 1) % sorted.length];
          const size = angleDelta(current.angle, next.angle);
          const mid = normalizeAngle(current.angle + size / 2);
          gaps.push({
            start: current.angle,
            end: next.angle,
            mid,
            size,
            // Prefer gaps that are not tiny wedges between already-packed labels.
            score: size
          });
        }
        return gaps.sort((left, right) => right.score - left.score);
      };
      floaters.forEach((floater) => {
        const gaps = largestGaps(occupied);
        const topGaps = gaps.slice(0, Math.max(2, Math.min(4, gaps.length)));
        let best = topGaps[0] || { mid: floater.mid, size: Math.PI * 2 };
        let bestScore = -Infinity;
        topGaps.forEach((gap) => {
          if (gap.size < 0.34) return;
          const proximity = Math.PI * 2 - Math.min(
            angleDelta(floater.mid, gap.mid),
            angleDelta(gap.mid, floater.mid)
          );
          const score = gap.size * 2.4 + proximity * 0.35;
          if (score > bestScore) {
            bestScore = score;
            best = gap;
          }
        });
        occupied.push({
          ...floater,
          angle: best.mid,
          relocated: true
        });
      });
      occupied.sort((left, right) => left.angle - right.angle);
      const minGap = occupied.length >= 8 ? 0.3 : 0.34;
      for (let pass = 0; pass < 4; pass += 1) {
        for (let index = 0; index < occupied.length; index += 1) {
          const current = occupied[index];
          const next = occupied[(index + 1) % occupied.length];
          const gap = angleDelta(current.angle, next.angle);
          if (gap >= minGap) continue;
          const need = (minGap - gap) / 2;
          const nudgeCurrent = current.relocated || current.sharePct <= next.sharePct;
          const nudgeNext = next.relocated || next.sharePct < current.sharePct;
          if (nudgeCurrent) {
            current.angle = normalizeAngle(current.angle - need);
          }
          if (nudgeNext) {
            next.angle = normalizeAngle(next.angle + need);
          }
          if (!nudgeCurrent && !nudgeNext) {
            next.angle = normalizeAngle(next.angle + (minGap - gap));
          }
        }
        occupied.sort((left, right) => left.angle - right.angle);
      }
      const layouts = occupied.map((row) => {
        const radius = outerRadius + 26 + (row.relocated ? 14 : 0) + (row.sharePct < 3 ? 8 : 0);
        const point = pointFromAngle(row.angle, radius);
        return {
          entry: row.entry,
          index: row.index,
          mid: row.angle,
          sharePct: row.sharePct,
          x: point.x,
          y: point.y,
          anchor: anchorFromAngle(row.angle)
        };
      });
      const grouped = { left: [], right: [], center: [] };
      layouts.forEach((layout) => {
        grouped[layout.anchor].push(layout);
      });
      Object.values(grouped).forEach((group) => {
        group.sort((left, right) => left.y - right.y);
        for (let index = 1; index < group.length; index += 1) {
          const minYGap = group.length >= 4 ? 28 : 32;
          if (group[index].y - group[index - 1].y < minYGap) {
            group[index].y = group[index - 1].y + minYGap;
          }
        }
      });
      return layouts;
    }
    function ensureExactProviderDistributionSlots(entries) {
      const normalized = normalizeDistributionEntries(entries);
      const byMarket = new Map(normalized.map((entry) => [entry.marketplace, entry]));
      ["Steam", "Skinport", "CSFloat", "White.Market", "DMarket"].forEach((marketplace) => {
        if (!byMarket.has(marketplace)) {
          byMarket.set(marketplace, {
            marketplace,
            volume: 0,
            pct: 0,
            avg_price: 0,
            unavailable: true
          });
        }
      });
      return DISTRIBUTION_VISIBLE_MARKETS.map((marketplace) => byMarket.get(marketplace)).filter(Boolean);
    }
    function shouldUseFallbackDistribution(entries) {
      const concreteEntries = normalizeDistributionEntries(entries).filter((entry) => entry.marketplace !== "Other");
      if (!concreteEntries.length) {
        return true;
      }
      const uniqueMarkets = [...new Set(concreteEntries.map((entry) => entry.marketplace))];
      if (uniqueMarkets.length === 1 && uniqueMarkets[0] === "Steam") {
        return true;
      }
      const totalVolume = concreteEntries.reduce((sum, entry) => sum + Number(entry.volume || 0), 0);
      const steamVolume = concreteEntries.filter((entry) => entry.marketplace === "Steam").reduce((sum, entry) => sum + Number(entry.volume || 0), 0);
      const steamShare = totalVolume > 0 ? steamVolume / totalVolume * 100 : 0;
      if (uniqueMarkets.length <= 2) {
        return true;
      }
      return uniqueMarkets.length <= 3 && steamShare >= 90;
    }
    function formatDistributionUpdatedAt(raw) {
      const text = String(raw || "").trim();
      if (!text) return "";
      const date = new Date(text);
      if (Number.isNaN(date.getTime())) return "";
      const now = /* @__PURE__ */ new Date();
      const sameDay = date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth() && date.getUTCDate() === now.getUTCDate();
      const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return sameDay ? `updated ${time}` : `updated ${date.toLocaleDateString()} ${time}`;
    }
    function resolveDistributionState(range, payload) {
      const normalizedEntries = normalizeDistributionEntries(payload?.data || payload);
      if (shouldUseFallbackDistribution(normalizedEntries)) {
        return fallbackSupply(range);
      }
      if (!normalizedEntries.length) {
        return fallbackSupply(range);
      }
      const totalFromPayload = Number(payload?.total || 0);
      const resolvedTotal = Number.isFinite(totalFromPayload) && totalFromPayload > 0 ? totalFromPayload : normalizedEntries.reduce((sum, entry) => sum + Number(entry.volume || 0), 0);
      if (!resolvedTotal) {
        return fallbackSupply(range);
      }
      return {
        total: resolvedTotal,
        data: normalizedEntries.map((entry) => ({
          ...entry,
          pct: entry.pct > 0 ? entry.pct : Number((Number(entry.volume || 0) / resolvedTotal * 100).toFixed(2))
        }))
      };
    }
    function disposeViewerMaterials(material) {
      if (!material) return;
      if (Array.isArray(material)) {
        material.forEach(disposeViewerMaterials);
        return;
      }
      Object.values(material).forEach((value) => {
        if (value && typeof value === "object" && typeof value.dispose === "function") {
          value.dispose();
        }
      });
      if (typeof material.dispose === "function") {
        material.dispose();
      }
    }
    function computeRenderableBounds(object, three) {
      const bounds = new three.Box3();
      const tempBounds = new three.Box3();
      let hasBounds = false;
      object.traverse((child) => {
        if (!child?.visible || !child.isMesh || !child.geometry) {
          return;
        }
        if (!child.geometry.boundingBox && typeof child.geometry.computeBoundingBox === "function") {
          child.geometry.computeBoundingBox();
        }
        if (!child.geometry.boundingBox) {
          return;
        }
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
      if (!object) return null;
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
      if (!hasPoints) {
        return null;
      }
      bounds.min.x -= 0.32;
      bounds.max.x += 0.32;
      bounds.min.z -= 0.22;
      bounds.max.z += 0.22;
      bounds.min.y -= 0.12;
      bounds.max.y += 0.18;
      return bounds;
    }
    function computeViewerBounds(object, three, options = {}) {
      const { isAgentModel = false } = options;
      if (isAgentModel) {
        const skeletonBounds = computeSkeletonBounds(object, three);
        if (skeletonBounds) {
          return skeletonBounds;
        }
      }
      return computeRenderableBounds(object, three);
    }
    function normalizeViewerModelScale(object, three, options = {}) {
      const { isAgentModel = false } = options;
      if (!object) return;
      const bounds = computeViewerBounds(object, three, { isAgentModel });
      const size = bounds.getSize(new three.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z) || 0;
      if (!isAgentModel || maxDimension <= 0 || maxDimension >= 0.3) {
        return;
      }
      const targetHeight = 1.74;
      const currentHeight = Math.max(size.y, maxDimension, 1e-3);
      const upscaleFactor = targetHeight / currentHeight;
      object.scale.multiplyScalar(upscaleFactor);
      object.updateMatrixWorld(true);
    }
    function skinViewerGunHelpers() {
      return window.CS2SkinViewer || {};
    }
    function normalizeGunPresentation(modelRoot, three, options = {}) {
      skinViewerGunHelpers().normalizeGunPresentation?.(modelRoot, three, options);
    }
    function applyWeaponInspectPose(modelRoot, three, options = {}) {
      skinViewerGunHelpers().applyWeaponInspectPose?.(modelRoot, three, options);
    }
    function applyCharmInspectPresentation(modelRoot, three, options = {}) {
      return skinViewerGunHelpers().applyCharmInspectPresentation?.(modelRoot, three, options) || { kind: "none", lift: 0 };
    }
    function looksLikeCharmInspectModel(url, title) {
      const helper = skinViewerGunHelpers().looksLikeCharmInspectModel;
      if (typeof helper === "function") return helper(url, title);
      return /keychains\/|\/kc_|charm\.gltf|\bcharm\s*\|/i.test(`${url || ""} ${title || ""}`);
    }
    function resolveCharmInspectCameraPlacement(framedCenter, framedSize, three, options = {}) {
      return skinViewerGunHelpers().resolveCharmInspectCameraPlacement?.(
        framedCenter,
        framedSize,
        three,
        options
      ) || null;
    }
    function centerGunModelInView(modelRoot, three, options = {}) {
      const helper = skinViewerGunHelpers().centerGunModelInView;
      if (typeof helper === "function") {
        helper(modelRoot, three, options);
        return;
      }
      modelRoot.updateMatrixWorld(true);
      const initialBounds = computeViewerBounds(modelRoot, three, options);
      const rotatedCenter = initialBounds.getCenter(new three.Vector3());
      modelRoot.position.sub(rotatedCenter);
      modelRoot.updateMatrixWorld(true);
    }
    function resolveStandardGunCameraPlacement(framedCenter, framedSize, three, options = {}) {
      const placement = skinViewerGunHelpers().resolveStandardGunCameraPlacement?.(
        framedCenter,
        framedSize,
        three,
        options
      );
      if (placement) return placement;
      const viewerAspect = Math.max(options.viewerAspect || 1, 1);
      const verticalFov = three.MathUtils.degToRad(options.cameraFov || VIEWER_CAMERA_FOV);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * viewerAspect);
      const lengthSize = Math.max(framedSize.x, 1e-3);
      const heightSize = Math.max(framedSize.y, 1e-3);
      const depthSize = Math.max(framedSize.z, 1e-3);
      const fitHeightDistance = heightSize * 0.5 * 1.14 / Math.tan(verticalFov / 2);
      const fitWidthDistance = lengthSize * 0.5 * 1.02 / Math.tan(horizontalFov / 2);
      const cameraDistance = Math.max(fitHeightDistance, fitWidthDistance) * 1.36 + depthSize * 0.28;
      const focus = framedCenter.clone();
      const position = focus.clone();
      position.z += cameraDistance * 0.94;
      return {
        position,
        focus,
        cameraDistance,
        maxDimension: Math.max(lengthSize, heightSize, depthSize)
      };
    }
    function isGlockLegacyPaintMesh(child) {
      const name = String(child?.name || "").toLowerCase();
      return /glock18|pist_glock/.test(name) && name.includes("body_legacy");
    }
    function prepareGlockLegacyPaintMesh(child, three) {
      if (!child?.isMesh || !isGlockLegacyPaintMesh(child) || child.userData?.glockLegacyPrepared) return;
      const geometry = child.geometry;
      if (geometry?.attributes?.uv) {
        geometry.setAttribute("uv2", geometry.attributes.uv.clone());
      }
      if (geometry?.attributes?.position && !geometry.userData?.glockInnerShell) {
        const pos = geometry.attributes.position;
        const nrm = geometry.attributes.normal;
        const vertCount = pos.count;
        const next = new three.BufferGeometry();
        Object.keys(geometry.attributes).forEach((name) => {
          const attr = geometry.attributes[name];
          const ArrayType = attr.array.constructor;
          const merged = new ArrayType(attr.array.length * 2);
          merged.set(attr.array, 0);
          if (name === "normal") {
            for (let i = 0; i < attr.array.length; i += 1) merged[attr.array.length + i] = -attr.array[i];
          } else if (name === "position" && nrm) {
            const eps = 0.012;
            for (let i = 0; i < vertCount; i += 1) {
              const dst = (vertCount + i) * attr.itemSize;
              const src = i * attr.itemSize;
              const ns = i * nrm.itemSize;
              merged[dst] = attr.array[src] - nrm.array[ns] * eps;
              merged[dst + 1] = attr.array[src + 1] - nrm.array[ns + 1] * eps;
              if (attr.itemSize > 2) merged[dst + 2] = attr.array[src + 2] - nrm.array[ns + 2] * eps;
            }
          } else {
            merged.set(attr.array, attr.array.length);
          }
          next.setAttribute(name, new three.BufferAttribute(merged, attr.itemSize, attr.normalized));
        });
        if (geometry.index) {
          const srcArr = geometry.index.array;
          const IndexType = vertCount * 2 > 65535 ? Uint32Array : srcArr.constructor;
          const merged = new IndexType(srcArr.length * 2);
          merged.set(srcArr, 0);
          for (let i = 0; i < srcArr.length; i += 3) {
            merged[srcArr.length + i] = srcArr[i] + vertCount;
            merged[srcArr.length + i + 1] = srcArr[i + 2] + vertCount;
            merged[srcArr.length + i + 2] = srcArr[i + 1] + vertCount;
          }
          next.setIndex(new three.BufferAttribute(merged, 1));
        }
        if (next.attributes.uv) next.setAttribute("uv2", next.attributes.uv.clone());
        next.userData.glockInnerShell = true;
        next.computeBoundingSphere?.();
        child.geometry = next;
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat) return;
        if (three.FrontSide != null) mat.side = three.FrontSide;
        if (three.ClampToEdgeWrapping != null) {
          [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap].forEach((tex) => {
            if (!tex) return;
            tex.wrapS = three.ClampToEdgeWrapping;
            tex.wrapT = three.ClampToEdgeWrapping;
            tex.needsUpdate = true;
          });
        }
        mat.needsUpdate = true;
      });
      child.userData.glockLegacyPrepared = true;
    }
    function socialAvatarUrl(author) {
      const seed = String(author || "steam-user").trim() || "steam-user";
      return "https://api.dicebear.com/7.x/thumbs/svg?seed=" + encodeURIComponent(seed);
    }
    function socialStorageKey(itemId) {
      return `cs2_social_v1_${itemId}`;
    }
    function socialReactionsKey(itemId) {
      return `cs2_social_reactions_v1_${itemId}`;
    }
    function socialReactionCountsKey(itemId) {
      return `cs2_social_counts_v1_${itemId}`;
    }
    function socialProfileKey() {
      return "cs2_social_profile_v1";
    }
    const SOCIAL_IDEA_DRAFT_PREFIX = "cs2_idea_draft_v1_";
    function socialIdeaDraftStorageKeys(itemId, marketHash) {
      const keys = [];
      const hash = String(marketHash || QUERY_MARKET_HASH_NAME || QUERY_LOOKUP_NAME || "").trim().toLowerCase();
      if (hash) keys.push(SOCIAL_IDEA_DRAFT_PREFIX + "name_" + hash);
      const id = Number(itemId);
      if (Number.isFinite(id) && id > 0) keys.push(SOCIAL_IDEA_DRAFT_PREFIX + "id_" + id);
      if (!keys.length) keys.push(SOCIAL_IDEA_DRAFT_PREFIX + "id_1");
      return keys;
    }
    function normalizeSocialIdeaDraft(raw) {
      if (!raw || typeof raw !== "object") return null;
      const sentiment = raw.sentiment === "bullish" || raw.sentiment === "bearish" ? raw.sentiment : null;
      return {
        text: String(raw.text || ""),
        sentiment,
        target: String(raw.target || ""),
        giphyUrl: String(raw.giphyUrl || raw.giphy_url || ""),
        publishAfterLogin: Boolean(raw.publishAfterLogin),
        savedAt: Number(raw.savedAt) || Date.now()
      };
    }
    function socialIdeaDraftHasContent(draft) {
      if (!draft) return false;
      return Boolean(
        String(draft.text || "").trim() || String(draft.giphyUrl || "").trim() || String(draft.target || "").trim() || draft.sentiment
      );
    }
    function persistSocialIdeaDraft(itemId, marketHash, draft) {
      const normalized = normalizeSocialIdeaDraft(draft);
      if (!normalized) return;
      const payload = JSON.stringify(normalized);
      socialIdeaDraftStorageKeys(itemId, marketHash).forEach(function(key) {
        try {
          sessionStorage.setItem(key, payload);
        } catch (_e) {
        }
        try {
          localStorage.setItem(key, payload);
        } catch (_e) {
        }
      });
    }
    function loadSocialIdeaDraft(itemId, marketHash) {
      const stores = [];
      try {
        stores.push(sessionStorage);
      } catch (_e) {
      }
      try {
        stores.push(localStorage);
      } catch (_e) {
      }
      const keys = socialIdeaDraftStorageKeys(itemId, marketHash);
      for (let i = 0; i < keys.length; i += 1) {
        for (let s = 0; s < stores.length; s += 1) {
          try {
            const raw = stores[s].getItem(keys[i]);
            if (!raw) continue;
            const parsed = normalizeSocialIdeaDraft(JSON.parse(raw));
            if (parsed) return parsed;
          } catch (_e) {
          }
        }
      }
      return null;
    }
    function clearSocialIdeaDraft(itemId, marketHash) {
      const keys = socialIdeaDraftStorageKeys(itemId, marketHash);
      keys.forEach(function(key) {
        try {
          sessionStorage.removeItem(key);
        } catch (_e) {
        }
        try {
          localStorage.removeItem(key);
        } catch (_e) {
        }
      });
    }
    function initialSocialIdeaDraft() {
      return loadSocialIdeaDraft(
        Number.isFinite(QUERY_ITEM_ID) && QUERY_ITEM_ID > 0 ? QUERY_ITEM_ID : 1,
        QUERY_MARKET_HASH_NAME || QUERY_LOOKUP_NAME
      );
    }
    function socialSessionActorId(session) {
      if (!session) return "";
      const steamId = String(session.steamid || session.steam_id || "").replace(/\D+/g, "");
      if (steamId.length >= 17) return steamId.slice(0, 32);
      const provider = String(session.provider || "").toLowerCase();
      const providerId = String(session.provider_id || session.email || "").replace(/[^a-zA-Z0-9_\-]/g, "");
      if (provider && providerId) return (provider.charAt(0) + providerId).slice(0, 32);
      return steamId;
    }
    function loadSocialProfile() {
      try {
        const stored = JSON.parse(localStorage.getItem(socialProfileKey()) || "{}");
        const author = String(stored.author || "You").trim() || "You";
        return {
          author,
          avatar: String(stored.avatar || "").trim()
        };
      } catch (_error) {
        return { author: "You", avatar: "" };
      }
    }
    function saveSocialProfile(profile) {
      try {
        localStorage.setItem(socialProfileKey(), JSON.stringify({
          author: String(profile?.author || "You").trim() || "You",
          avatar: String(profile?.avatar || "").trim()
        }));
      } catch (_error) {
      }
    }
    function steamLoginHref() {
      try {
        return "steam_login.php?return_to=" + encodeURIComponent(window.location.href);
      } catch (_error) {
        return "steam_login.php";
      }
    }
    function promptSocialLogin() {
      try {
        window.dispatchEvent(new CustomEvent("cs2:open-login-modal"));
      } catch (_error) {
        try {
          window.location.href = steamLoginHref();
        } catch (_e2) {
        }
      }
    }
    const GUEST_SOCIAL_AVATAR_SEED = "guest";
    function resolveSocialIdentity(steamSession, profile) {
      if (steamSession) {
        const author2 = String(steamSession.persona_name || profile?.author || "Steam User").trim() || "Steam User";
        const avatar = String(steamSession.avatar || profile?.avatar || "").trim();
        return {
          author: author2,
          avatar: avatar || socialAvatarUrl(author2),
          steamId: socialSessionActorId(steamSession),
          isLoggedIn: true
        };
      }
      const author = String(profile?.author || "You").trim() || "You";
      return {
        author,
        avatar: String(profile?.avatar || "").trim() || socialAvatarUrl(author),
        steamId: "",
        isLoggedIn: false
      };
    }
    function loadSocialReactions(itemId) {
      try {
        const stored = JSON.parse(localStorage.getItem(socialReactionsKey(itemId)) || "{}");
        return stored && typeof stored === "object" ? stored : {};
      } catch (_error) {
        return {};
      }
    }
    function persistSocialReactions(itemId, reactions) {
      try {
        localStorage.setItem(socialReactionsKey(itemId), JSON.stringify(reactions));
      } catch (_error) {
      }
    }
    function applySocialReactionCounts(posts, itemId) {
      try {
        const map = JSON.parse(localStorage.getItem(socialReactionCountsKey(itemId)) || "{}");
        if (!map || typeof map !== "object") return posts;
        return posts.map((post) => {
          const override = map[String(post.id)];
          if (!override) return post;
          return Object.assign({}, post, {
            likes: Number(override.likes ?? post.likes ?? 0),
            dislikes: Number(override.dislikes ?? post.dislikes ?? 0)
          });
        });
      } catch (_error) {
        return posts;
      }
    }
    function persistSocialReactionCounts(itemId, postId, likes, dislikes) {
      try {
        const key = socialReactionCountsKey(itemId);
        const map = JSON.parse(localStorage.getItem(key) || "{}");
        map[String(postId)] = { likes, dislikes };
        localStorage.setItem(key, JSON.stringify(map));
      } catch (_error) {
      }
    }
    function stableSocialItemId(seed) {
      const value = String(seed || "item");
      let hash = 0;
      for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash) || 1;
    }
    const SOCIAL_FEED_VISIBLE = 3;
    const SOCIAL_THREAD_VISIBLE = 3;
    const SOCIAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
    const SOCIAL_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
    const GIPHY_FAVS_KEY = "cs2_giphy_favs_v1";
    const GIPHY_CAT_PREVIEWS_KEY = "cs2_giphy_cat_previews_v2";
    const GIPHY_CAT_PREVIEWS_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
    const GIPHY_LIVE_SEARCH_MS = 300;
    const GIPHY_CATEGORIES = [
      { id: "favourites", labelKey: "giphy_favourites", kind: "favourites" },
      { id: "trending", labelKey: "giphy_trending", kind: "trending", icon: "fa-solid fa-arrow-trend-up" },
      { id: "hello", labelKey: "giphyCat_hello", kind: "search", q: "hello" },
      { id: "lol", labelKey: "giphyCat_lol", kind: "search", q: "lol" },
      { id: "love", labelKey: "giphyCat_love", kind: "search", q: "love" },
      { id: "happy-birthday", labelKey: "giphyCat_happyBirthday", kind: "search", q: "happy birthday" },
      { id: "thank-you", labelKey: "giphyCat_thankYou", kind: "search", q: "thank you" },
      { id: "excited", labelKey: "giphyCat_excited", kind: "search", q: "excited" },
      { id: "yes", labelKey: "giphyCat_yes", kind: "search", q: "yes" },
      { id: "no", labelKey: "giphyCat_no", kind: "search", q: "no" },
      { id: "sorry", labelKey: "giphyCat_sorry", kind: "search", q: "sorry" },
      { id: "happy", labelKey: "giphyCat_happy", kind: "search", q: "happy" },
      { id: "sad", labelKey: "giphyCat_sad", kind: "search", q: "sad" },
      { id: "thumbs-up", labelKey: "giphyCat_thumbsUp", kind: "search", q: "thumbs up" },
      { id: "scared", labelKey: "giphyCat_scared", kind: "search", q: "scared" },
      { id: "bye", labelKey: "giphyCat_bye", kind: "search", q: "bye" },
      { id: "confused", labelKey: "giphyCat_confused", kind: "search", q: "confused" },
      { id: "angry", labelKey: "giphyCat_angry", kind: "search", q: "angry" }
    ];
    function loadGiphyFavourites() {
      try {
        const raw = JSON.parse(localStorage.getItem(GIPHY_FAVS_KEY) || "[]");
        if (!Array.isArray(raw)) return [];
        return raw.map(function(row) {
          if (!row || typeof row !== "object") return null;
          const id = String(row.id || "").trim();
          const url = String(row.url || "").trim();
          const preview = String(row.preview || url).trim();
          if (!id || !url) return null;
          return {
            id,
            title: String(row.title || ""),
            preview,
            url,
            width: Number(row.width) || 0,
            height: Number(row.height) || 0
          };
        }).filter(Boolean).slice(0, 48);
      } catch (_e) {
        return [];
      }
    }
    function saveGiphyFavourites(list) {
      try {
        localStorage.setItem(GIPHY_FAVS_KEY, JSON.stringify((list || []).slice(0, 48)));
      } catch (_e) {
      }
    }
    function lastSavedGiphyFavouriteUrl(list) {
      if (!Array.isArray(list) || !list.length) return "";
      const last = list[0];
      if (!last || typeof last !== "object") return "";
      const url = String(last.url || last.preview || "").trim();
      return /^https:\/\//i.test(url) ? url : "";
    }
    function loadCachedGiphyCategoryPreviews() {
      try {
        try {
          localStorage.removeItem("cs2_giphy_cat_previews_v1");
        } catch (_drop) {
        }
        const raw = JSON.parse(localStorage.getItem(GIPHY_CAT_PREVIEWS_KEY) || "null");
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
        const savedAt = Number(raw.savedAt) || 0;
        if (!savedAt || Date.now() - savedAt > GIPHY_CAT_PREVIEWS_TTL_MS) return {};
        const map = raw.map && typeof raw.map === "object" && !Array.isArray(raw.map) ? raw.map : {};
        const out = {};
        Object.keys(map).forEach(function(key) {
          if (key === "favourites") return;
          const url = String(map[key] || "").trim();
          if (url && /^https:\/\//i.test(url)) out[key] = url;
        });
        if (!Object.keys(out).length) return {};
        return out;
      } catch (_e) {
        return {};
      }
    }
    function saveCachedGiphyCategoryPreviews(map) {
      try {
        const cleaned = {};
        Object.keys(map || {}).forEach(function(key) {
          if (key === "favourites") return;
          const url = String(map[key] || "").trim();
          if (url && /^https:\/\//i.test(url)) cleaned[key] = url;
        });
        if (!Object.keys(cleaned).length) {
          localStorage.removeItem(GIPHY_CAT_PREVIEWS_KEY);
          return;
        }
        localStorage.setItem(GIPHY_CAT_PREVIEWS_KEY, JSON.stringify({
          savedAt: Date.now(),
          map: cleaned
        }));
      } catch (_e) {
      }
    }
    function socialPublicImageSrc(url) {
      const value = String(url || "").trim();
      if (/^uploads\/community\/[a-f0-9]{16,64}\.(jpe?g|png|webp|gif)$/i.test(value)) {
        return value;
      }
      return "";
    }
    function formatSocialCommentFromApi(row) {
      const createdAt = row?.created_at ? Date.parse(String(row.created_at)) : Date.now();
      const author = String(row?.author || "Steam User");
      const avatar = String(row?.avatar_url || "").trim();
      return {
        id: String(row?.id ?? ""),
        steamId: String(row?.steam_id || ""),
        avatar: avatar || socialAvatarUrl(author),
        author,
        body: String(row?.body || ""),
        image: socialPublicImageSrc(row?.image_url),
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now()
      };
    }
    function formatSocialPostFromApi(row) {
      const createdAt = row?.created_at ? Date.parse(String(row.created_at)) : Date.now();
      const author = String(row?.author || "Steam User");
      const avatar = String(row?.avatar_url || "").trim();
      const comments = Array.isArray(row?.comments) ? row.comments.map(formatSocialCommentFromApi) : [];
      return {
        id: String(row?.id ?? `local-${Date.now()}`),
        steamId: String(row?.steam_id || ""),
        avatar: avatar || socialAvatarUrl(author),
        author,
        sentiment: row?.sentiment || null,
        target: row?.target_price != null ? Number(row.target_price) : null,
        body: String(row?.body || ""),
        image: socialPublicImageSrc(row?.image_url),
        likes: Number(row?.likes || 0),
        dislikes: Number(row?.dislikes || 0),
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        comments
      };
    }
    function loadSocialPosts(itemId) {
      try {
        const stored = localStorage.getItem(socialStorageKey(itemId));
        return stored ? JSON.parse(stored) : [];
      } catch (_e) {
        return [];
      }
    }
    function mergeSocialFeeds(apiPosts, localPosts) {
      const merged = Array.isArray(apiPosts) ? [...apiPosts] : [];
      const seen = new Set(merged.map((post) => String(post?.id || "")));
      (Array.isArray(localPosts) ? localPosts : []).forEach((post) => {
        const id = String(post?.id || "");
        if (!id || seen.has(id)) return;
        seen.add(id);
        merged.push(post);
      });
      return merged.sort((left, right) => Number(right?.createdAt || 0) - Number(left?.createdAt || 0));
    }
    function persistSocialPost(itemId, post) {
      try {
        const stored = localStorage.getItem(socialStorageKey(itemId));
        const userPosts = stored ? JSON.parse(stored) : [];
        userPosts.unshift(post);
        localStorage.setItem(socialStorageKey(itemId), JSON.stringify(userPosts.slice(0, 100)));
      } catch (_e) {
      }
    }
    function updateStoredSocialPost(itemId, post) {
      try {
        const stored = localStorage.getItem(socialStorageKey(itemId));
        const userPosts = stored ? JSON.parse(stored) : [];
        const index = userPosts.findIndex((entry) => String(entry?.id) === String(post?.id));
        if (index < 0) return;
        userPosts[index] = post;
        localStorage.setItem(socialStorageKey(itemId), JSON.stringify(userPosts.slice(0, 100)));
      } catch (_error) {
      }
    }
    function removeStoredSocialPost(itemId, postId) {
      try {
        const stored = localStorage.getItem(socialStorageKey(itemId));
        const userPosts = stored ? JSON.parse(stored) : [];
        const nextPosts = userPosts.filter((entry) => String(entry?.id) !== String(postId));
        localStorage.setItem(socialStorageKey(itemId), JSON.stringify(nextPosts.slice(0, 100)));
      } catch (_error) {
      }
    }
    function canManageSocialPost(post, identity) {
      if (!post || !identity) return false;
      const id = String(post.id || "");
      if (id.startsWith("local-")) return true;
      if (identity.isLoggedIn && identity.steamId && post.steamId) {
        return String(post.steamId) === String(identity.steamId);
      }
      if (!identity.isLoggedIn && !post.steamId) {
        return String(post.author || "").trim().toLowerCase() === String(identity.author || "").trim().toLowerCase();
      }
      return false;
    }
    function loadLocalSocialFeed(itemId) {
      const posts = applySocialReactionCounts(loadSocialPosts(itemId), itemId);
      return {
        posts,
        reactions: loadSocialReactions(itemId)
      };
    }
    function timeAgo(ts) {
      const s = Math.floor((Date.now() - ts) / 1e3);
      if (s < 60) return "just now";
      if (s < 3600) return `${Math.floor(s / 60)}m ago`;
      if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
      return `${Math.floor(s / 86400)}d ago`;
    }
    function readCaseCatalogEntry(names) {
      const list = Array.isArray(names) ? names : [names];
      const data = window.CS2ReactData || {};
      if (typeof data.resolveCaseCatalogEntry === "function") {
        const resolved = data.resolveCaseCatalogEntry(...list);
        if (resolved) return resolved;
      }
      const catalog = Array.isArray(data.CASE_CATALOG) ? data.CASE_CATALOG : [];
      const normalize = (value) => String(value || "").trim().toLowerCase().replace(/cs:go/g, "csgo").replace(/cs-go/g, "csgo").replace(/\s+/g, " ");
      const variants = (name) => {
        const clean = String(name || "").trim();
        const set = /* @__PURE__ */ new Set();
        if (!clean) return [];
        set.add(clean);
        if (!/\bcase\b/i.test(clean)) {
          set.add(`${clean} Case`);
          set.add(`${clean} Weapon Case`);
        }
        return [...set];
      };
      for (const raw of list) {
        for (const variant of variants(raw)) {
          const key = normalize(variant);
          if (!key) continue;
          const exact = catalog.find((entry) => normalize(entry.name) === key);
          if (exact) return exact;
        }
      }
      for (const raw of list) {
        const key = normalize(raw);
        if (!key) continue;
        const partial = catalog.find((entry) => {
          const entryKey = normalize(entry.name);
          return key.includes(entryKey) || entryKey.includes(key);
        });
        if (partial) return partial;
      }
      return null;
    }
    function ItemPage() {
      const { t, tp } = useI18n();
      useLayoutEffect(() => {
        scrollItemPageToTop();
      }, [QUERY_LOOKUP_NAME]);
      const { authenticated: isAuthenticated, loginHref: sessionSteamLoginHref, user: headerSessionUser } = typeof useSteamSession === "function" ? useSteamSession() : { authenticated: false, loginHref: "login.html", user: null };
      const fallbackMarketRows = MARKETPLACE_PRICE_TABLE.map((entry, index) => {
        const listing = LISTING_FALLBACKS[entry.key];
        const basePrice = Number(listing?.best_price || 0);
        const feePct = Number(listing?.fee_pct ?? (entry.sourceId === "steam" ? 15 : 0));
        const finalPrice = basePrice * (1 + feePct / 100);
        return {
          name: entry.name,
          image: marketplaceTableImage(entry.name),
          basePrice: formatTablePrice(entry.sourceId === "steam" ? basePrice / 1.15 : basePrice),
          fee: formatFee(feePct),
          finalPrice: formatTablePrice(entry.sourceId === "steam" ? basePrice : finalPrice),
          extra: index >= PRIMARY_MARKETPLACE_COUNT,
          market_url: buildMarketplaceSearchUrl(entry.name, DEFAULT_ITEM_DETAILS.title, DEFAULT_WEAR)
        };
      });
      const initialTrackedItemId = Number.isFinite(QUERY_ITEM_ID) && QUERY_ITEM_ID > 0 ? QUERY_ITEM_ID : 1;
      const initialInspectWear = HAS_WEAR_VARIANTS ? DEFAULT_WEAR : "";
      const [trackedItemId, setTrackedItemId] = useState(initialTrackedItemId);
      const [itemLookupResolved, setItemLookupResolved] = useState(!QUERY_LOOKUP_NAME);
      const [priceRange, setPriceRange] = useState("ALL");
      const [priceSource, setPriceSource] = useState("steam");
      const [analyticsBundle, setAnalyticsBundle] = useState(null);
      const [singleMarketActivity, setSingleMarketActivity] = useState(null);
      const [analyticsLoading, setAnalyticsLoading] = useState(false);
      const [analyticsError, setAnalyticsError] = useState("");
      const [qualityRows, setQualityRows] = useState(() => createEmptyQualityRows());
      const [marketRowsData, setMarketRowsData] = useState(fallbackMarketRows);
      const [steamSnapshot, setSteamSnapshot] = useState(null);
      const [skinportSnapshot, setSkinportSnapshot] = useState(null);
      const [priceHistory, setPriceHistory] = useState(DEMO_PRICE_HISTORY);
      const [distributionRange, setDistributionRange] = useState("1Y");
      const initialSupply = fallbackSupply("1M");
      const distributionCacheRef = useRef({});
      const distributionRangeRef = useRef("1Y");
      const [distributionData, setDistributionData] = useState(initialSupply.data);
      const [distributionTotal, setDistributionTotal] = useState(initialSupply.total);
      const [distributionUpdatedAt, setDistributionUpdatedAt] = useState("");
      const [selectedMarket, setSelectedMarket] = useState("CSFloat");
      const [skinDescription, setSkinDescription] = useState(ITEM_DETAILS.description || "");
      const [skinOriginName, setSkinOriginName] = useState("");
      const skinOriginRef = useRef("");
      skinOriginRef.current = skinOriginName;
      const [remoteReleaseDateLabel, setRemoteReleaseDateLabel] = useState("");
      const [souvenirLookupReady, setSouvenirLookupReady] = useState(false);
      const [skinFloatRange, setSkinFloatRange] = useState(null);
      const [wearHistories, setWearHistories] = useState({});
      const [hiddenWearSeries, setHiddenWearSeries] = useState({});
      useEffect(() => {
        const load = window.CS2ReactData?.loadSouvenirSkinLookup;
        if (typeof load !== "function") {
          setSouvenirLookupReady(true);
          return void 0;
        }
        let cancelled = false;
        load().finally(() => {
          if (!cancelled) setSouvenirLookupReady(true);
        });
        return () => {
          cancelled = true;
        };
      }, []);
      const liveCaseEntry = useMemo(() => readCaseCatalogEntry([
        QUERY_BASE_NAME,
        QUERY_DISPLAY_NAME,
        QUERY_MARKET_HASH_NAME,
        QUERY_LOOKUP_NAME,
        QUERY_FULL_MARKET_NAME,
        SINGLE_ITEM_MARKET_HASH_NAME,
        itemTitle
      ]), []);
      const isMarketCaseQuery = QUERY_TYPE_FILTER === "cases" || /cases/i.test(QUERY_CATEGORY || "") || /case/i.test(QUERY_TYPE || "");
      const isCaseItemView = IS_CASE_ITEM || Boolean(liveCaseEntry) || isMarketCaseQuery;
      const caseMetaEntry = liveCaseEntry || caseCatalogEntry;
      const caseDescription = String(caseMetaEntry?.description || ITEM_DETAILS.description || "").trim();
      const itemDescriptionText = String(skinDescription || ITEM_DETAILS.description || "").trim();
      useEffect(() => {
        if (isCaseItemView || IS_INVENTORY_CONTEXT) {
          return void 0;
        }
        let alive = true;
        const lookupNames = [
          QUERY_BASE_NAME,
          QUERY_DISPLAY_NAME,
          QUERY_MARKET_HASH_NAME,
          QUERY_LOOKUP_NAME,
          SINGLE_ITEM_MARKET_HASH_NAME,
          itemTitle
        ].filter(Boolean);
        loadSkinDescriptionLookup().then((lookup) => {
          if (!alive) return;
          const resolved = resolveSkinDescriptionFromLookup(lookup, lookupNames);
          if (resolved) {
            setSkinDescription(resolved);
          }
        }).catch(() => {
        });
        loadSkinOriginLookup().then((lookup) => {
          if (!alive) return;
          if (window.CS2ReactData) {
            window.CS2ReactData.__skinOriginLookup = lookup;
          }
          const raw = resolveSkinOriginFromLookup(lookup, lookupNames) || resolveStickerOriginFromGroupMap(window.CS2ReactData?.STICKER_GROUP_MAP, lookupNames);
          const resolved = resolvePreferredSkinOrigin(raw, lookupNames);
          if (resolved) {
            setSkinOriginName(resolved);
          }
        }).catch(() => {
        });
        loadSkinFloatLookup().then((lookup) => {
          if (!alive) return;
          const resolved = resolveSkinFloatRangeFromLookup(lookup, lookupNames);
          if (resolved) {
            setSkinFloatRange(resolved);
          }
        }).catch(() => {
        });
        const releaseName = String(SINGLE_ITEM_MARKET_HASH_NAME || QUERY_MARKET_HASH_NAME || QUERY_LOOKUP_NAME || "").trim();
        if (releaseName) {
          fetch("get_item_release_date.php?market_hash_name=" + encodeURIComponent(releaseName), { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload) => {
            if (!alive || !payload) return;
            const display = String(payload.released_display || "").trim();
            if (display) {
              setRemoteReleaseDateLabel(display);
            }
          }).catch(() => {
          });
        }
        return () => {
          alive = false;
        };
      }, []);
      const marketAddedLabel = useMemo(() => {
        if (isCaseItemView) {
          return "";
        }
        const summary = singleMarketActivity?.summary || {};
        if (summary.first_listed_display) {
          return summary.first_listed_display;
        }
        if (summary.first_listed_at) {
          const parsed = new Date(summary.first_listed_at);
          if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
          }
        }
        const history = singleMarketActivity?.sales_history_by_range?.all || singleMarketActivity?.sales_history;
        if (Array.isArray(history) && history.length > 0 && history[0]?.date) {
          const parsed = new Date(history[0].date);
          if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
          }
        }
        return ITEM_DETAILS.added || "";
      }, [isCaseItemView, singleMarketActivity, ITEM_DETAILS.added]);
      const releaseDateLabel = remoteReleaseDateLabel || marketAddedLabel || "";
      const [listingsData, setListingsData] = useState(LISTING_FALLBACKS.CSFloat);
      const [roiRange, setRoiRange] = useState("1Y");
      const [roiHistory, setRoiHistory] = useState(null);
      const [providerRange, setProviderRange] = useState("1Y");
      const [remoteProviders, setRemoteProviders] = useState(void 0);
      const [catalogItem, setCatalogItem] = useState(null);
      const [dynamicMarketQuotes, setDynamicMarketQuotes] = useState({});
      const wearTableProvidersLoadedRef = useRef(/* @__PURE__ */ new Set(["steam"]));
      const [isViewerActive, setIsViewerActive] = useState(false);
      const [skinModelUrl, setSkinModelUrl] = useState("");
      const [skinModelMeta, setSkinModelMeta] = useState(null);
      const [viewerStatus, setViewerStatus] = useState("idle");
      const [fullscreenTarget, setFullscreenTarget] = useState("");
      const fullscreenTargetRef = useRef("");
      const ignoreFsExitUntilRef = useRef(0);
      const fsResizeGenRef = useRef(0);
      const nativeFsEnteredRef = useRef(false);
      useEffect(() => {
        fullscreenTargetRef.current = fullscreenTarget;
      }, [fullscreenTarget]);
      const [remoteMarketListings, setRemoteMarketListings] = useState({});
      const [inspectLinks, setInspectLinks] = useState({});
      const [inspectLoading, setInspectLoading] = useState(true);
      const [craftSkinEcon, setCraftSkinEcon] = useState(null);
      const [craftEconLoading, setCraftEconLoading] = useState(false);
      const [selectedInspectWear, setSelectedInspectWear] = useState(initialInspectWear);
      const [summaryTableOffset, setSummaryTableOffset] = useState(0);
      const [socialPosts, setSocialPosts] = useState([]);
      const [socialText, setSocialText] = useState(function() {
        return String(initialSocialIdeaDraft()?.text || "");
      });
      const [socialSentiment, setSocialSentiment] = useState(function() {
        const sentiment = initialSocialIdeaDraft()?.sentiment;
        return sentiment === "bullish" || sentiment === "bearish" ? sentiment : null;
      });
      const [socialTarget, setSocialTarget] = useState(function() {
        return String(initialSocialIdeaDraft()?.target || "");
      });
      const [socialLoading, setSocialLoading] = useState(true);
      const [socialSubmitting, setSocialSubmitting] = useState(false);
      const [socialReactions, setSocialReactions] = useState({});
      const [editingPostId, setEditingPostId] = useState(null);
      const [editingDraft, setEditingDraft] = useState({ body: "", sentiment: null, target: "" });
      const [socialActionId, setSocialActionId] = useState("");
      const [socialAuthor, setSocialAuthor] = useState(() => loadSocialProfile().author);
      const [socialAvatar, setSocialAvatar] = useState(() => loadSocialProfile().avatar);
      const [socialFeedExpanded, setSocialFeedExpanded] = useState(false);
      const [socialImageFile, setSocialImageFile] = useState(null);
      const [socialImagePreview, setSocialImagePreview] = useState(function() {
        return String(initialSocialIdeaDraft()?.giphyUrl || "");
      });
      const [socialGiphyUrl, setSocialGiphyUrl] = useState(function() {
        return String(initialSocialIdeaDraft()?.giphyUrl || "");
      });
      const [socialError, setSocialError] = useState("");
      const [commentDrafts, setCommentDrafts] = useState({});
      const [commentImages, setCommentImages] = useState({});
      const [commentPreviews, setCommentPreviews] = useState({});
      const [commentBusyId, setCommentBusyId] = useState("");
      const [expandedCommentPosts, setExpandedCommentPosts] = useState({});
      const socialImageInputRef = useRef(null);
      const [giphyOpen, setGiphyOpen] = useState(false);
      const [giphyQuery, setGiphyQuery] = useState("");
      const [giphyView, setGiphyView] = useState("categories");
      const [giphyHeading, setGiphyHeading] = useState({ kind: "categories", query: "" });
      const [giphyResults, setGiphyResults] = useState([]);
      const [giphyLoading, setGiphyLoading] = useState(false);
      const [giphyError, setGiphyError] = useState("");
      const [giphyFavs, setGiphyFavs] = useState(function() {
        return loadGiphyFavourites();
      });
      const [giphyCatPreviews, setGiphyCatPreviews] = useState(function() {
        return loadCachedGiphyCategoryPreviews();
      });
      const giphyCatPreviewInflightRef = useRef(false);
      const giphyCatPreviewsRef = useRef(giphyCatPreviews);
      giphyCatPreviewsRef.current = giphyCatPreviews;
      const giphySearchTimerRef = useRef(null);
      const giphySearchSeqRef = useRef(0);
      const giphyTypedQueryRef = useRef(false);
      const socialDraftPersistReadyRef = useRef(false);
      const socialAutoPublishRef = useRef(false);
      const [likedPosts, setLikedPosts] = useState({});
      const [steamSession, setSteamSession] = useState(null);
      const [showShareModal, setShowShareModal] = useState(false);
      const [alertModalOpen, setAlertModalOpen] = useState(false);
      const [caseSimOpen, setCaseSimOpen] = useState(false);
      const [caseSimLoading, setCaseSimLoading] = useState(false);
      const [caseSimError, setCaseSimError] = useState("");
      const [caseSimConfig, setCaseSimConfig] = useState(null);
      const [caseSimEqualWeight, setCaseSimEqualWeight] = useState(false);
      const [caseSimContentsReady, setCaseSimContentsReady] = useState(null);
      const [contentsPriceMap, setContentsPriceMap] = useState(() => /* @__PURE__ */ new Map());
      const [contentsPricesLoading, setContentsPricesLoading] = useState(false);
      const [caseOdds, setCaseOdds] = useState(null);
      const [caseOddsLoading, setCaseOddsLoading] = useState(false);
      const [watchlist, setWatchlist] = useState(() => {
        try {
          return JSON.parse(localStorage.getItem("cs2_watchlist") || "[]");
        } catch (_e) {
          return [];
        }
      });
      const [distRange2, setDistRange2] = useState("1Y");
      const [compareMarketTab, setCompareMarketTab] = useState("steam");
      const [provRange2, setProvRange2] = useState("1Y");
      const [providerMenuOpen, setProviderMenuOpen] = useState(false);
      const [hiddenProviders, setHiddenProviders] = useState(() => /* @__PURE__ */ new Set());
      const priceChartCanvasRef = useRef(null);
      const analyticsHistoryCanvasRef = useRef(null);
      const sourceCompareCanvasRef = useRef(null);
      const activityCanvasRef = useRef(null);
      const latestPriceRequestKeyRef = useRef("");
      const donutChartCanvasRef = useRef(null);
      const listingsBarCanvasRef = useRef(null);
      const roiCanvasRef = useRef(null);
      const providerCanvasRef = useRef(null);
      const viewerContainerRef = useRef(null);
      const previewCardRef = useRef(null);
      const previewInfoRef = useRef(null);
      const previewImageRef = useRef(null);
      const lwContainerRef = useRef(null);
      const lwChartRef = useRef(null);
      const lwAreaRef = useRef(null);
      const lwVolRef = useRef(null);
      const lwTooltipRef = useRef(null);
      const lwTimeLabelRef = useRef(null);
      const lwPointCountRef = useRef(0);
      const drawToolRef = useRef("cursor");
      const drawToolsApiRef = useRef(null);
      const [drawTool, setDrawTool] = useState("cursor");
      const chartDrawTools = window.CS2ChartDraw?.tools?.length ? window.CS2ChartDraw.tools : DEFAULT_CHART_DRAW_TOOLS;
      const chartDrawToolGroups = window.CS2ChartDraw?.toolGroups?.length ? window.CS2ChartDraw.toolGroups : DEFAULT_CHART_DRAW_GROUPS;
      const chartDrawToolLookup = useMemo(() => chartDrawTools.reduce((lookup, tool) => {
        lookup[tool.id] = tool;
        return lookup;
      }, {}), [chartDrawTools]);
      const isMainChartFullscreen = fullscreenTarget === "main-chart";
      const isPriceHistoryFullscreen = fullscreenTarget === "price-history";
      useEffect(() => {
        if (!isMainChartFullscreen) return;
        setPriceRange("ALL");
      }, [isMainChartFullscreen]);
      drawToolRef.current = drawTool;
      useEffect(() => {
        drawToolsApiRef.current?.updateOverlayPointer?.();
      }, [drawTool]);
      const DRAW_TOOLBAR_FS_WIDTH = 52;
      const PRICE_AXIS_LEFT_GUTTER = 0;
      const fullscreenChartLeftPx = () => DRAW_TOOLBAR_FS_WIDTH + PRICE_AXIS_LEFT_GUTTER;
      const isChartPanelFullscreen = (panel) => {
        if (!panel) return false;
        const active = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
        return active === panel || panel.classList.contains("is-native-fullscreen");
      };
      const isMainChartFsActive = (panel) => {
        if (fullscreenTargetRef.current === "main-chart") return true;
        if (panel && isChartPanelFullscreen(panel)) return true;
        if (panel?.parentElement === document.body && panel.classList?.contains("tv-chart-panel")) return true;
        const parked = document.querySelector("body > .tv-chart-panel");
        if (parked && (!panel || panel === parked)) return true;
        const active = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
        if (active?.classList?.contains("tv-chart-panel")) return true;
        if (active && panel && (active === panel || active.contains(panel) || panel.contains(active))) return true;
        return false;
      };
      const measureFullscreenViewportSize = (panel) => {
        const hdr = panel?.querySelector?.(".tv-chart-hdr");
        const toolbar = panel?.querySelector?.(".tv-toolbar");
        const note = panel?.querySelector?.(".tv-chart-note");
        const padY = 12 + 10;
        const chromeY = (hdr?.offsetHeight || 72) + (toolbar?.offsetHeight || 44) + (note?.offsetHeight || 0);
        const viewportW = window.innerWidth || document.documentElement?.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement?.clientHeight || 0;
        const drawW = DRAW_TOOLBAR_FS_WIDTH;
        const chartLeft = drawW + PRICE_AXIS_LEFT_GUTTER;
        const topbar = chromeY + padY;
        const width = Math.max(48, Math.floor(viewportW - chartLeft));
        const height = Math.max(48, Math.floor(viewportH - topbar));
        if (width < 48 || height < 48) return null;
        return { width, height, viewportW, viewportH, topbar, drawW, chartLeft };
      };
      const pinFullscreenHost = (el, leftPx, topPx) => {
        if (!el?.style) return;
        el.style.setProperty("position", "fixed", "important");
        el.style.setProperty("left", `${leftPx}px`, "important");
        el.style.setProperty("right", "0px", "important");
        el.style.setProperty("top", `${topPx}px`, "important");
        el.style.setProperty("bottom", "0px", "important");
        el.style.setProperty("inset", `${topPx}px 0px 0px ${leftPx}px`, "important");
        el.style.setProperty("width", `calc(100vw - ${leftPx}px)`, "important");
        el.style.setProperty("height", `calc(100vh - ${topPx}px)`, "important");
        el.style.setProperty("max-width", "none", "important");
        el.style.setProperty("max-height", "none", "important");
        el.style.setProperty("min-width", "0", "important");
        el.style.setProperty("min-height", "0", "important");
        el.style.setProperty("margin", "0", "important");
        el.style.setProperty("transform", "none", "important");
        el.style.setProperty("animation", "none", "important");
      };
      const prepareFullscreenChartLayout = (panel) => {
        if (!panel) return;
        const size = measureFullscreenViewportSize(panel);
        const stage = panel.querySelector(".tv-lw-stage");
        const wrap = panel.querySelector(".tv-lw-wrap");
        const canvas = panel.querySelector(".tv-lw-canvas");
        const drawBar = stage?.querySelector(".tv-draw-toolbar");
        const providerCanvas = panel.querySelector(".tv-provider-canvas");
        const topPx = size?.topbar || 128;
        const leftPx = size?.chartLeft || fullscreenChartLeftPx();
        panel.style.setProperty("--tv-fs-top", `${topPx}px`);
        panel.style.setProperty("--tv-fs-left", `${leftPx}px`);
        stage?.classList.add("is-drawing-mode");
        if (drawBar?.style) {
          drawBar.style.setProperty("display", "flex", "important");
          drawBar.style.setProperty("width", `${DRAW_TOOLBAR_FS_WIDTH}px`, "important");
          drawBar.style.setProperty("flex", `0 0 ${DRAW_TOOLBAR_FS_WIDTH}px`, "important");
        }
        if (stage?.style) {
          stage.style.setProperty("position", "relative", "important");
          stage.style.setProperty("width", "100%", "important");
          stage.style.setProperty("flex", "1 1 0", "important");
          stage.style.setProperty("min-width", "0", "important");
          stage.style.setProperty("max-width", "none", "important");
        }
        pinFullscreenHost(wrap, leftPx, topPx);
        pinFullscreenHost(canvas, leftPx, topPx);
        if (providerCanvas?.style) {
          providerCanvas.style.setProperty("flex", "1 1 0", "important");
          providerCanvas.style.setProperty("width", "100%", "important");
          providerCanvas.style.setProperty("min-width", "0", "important");
          providerCanvas.style.setProperty("min-height", "0", "important");
          providerCanvas.style.setProperty("height", "auto", "important");
          providerCanvas.style.setProperty("max-height", "none", "important");
        }
        void panel.offsetWidth;
      };
      const lockFullscreenChartBox = (panel) => {
        if (!panel) return null;
        prepareFullscreenChartLayout(panel);
        const viewportSize = measureFullscreenViewportSize(panel);
        if (!viewportSize) return null;
        const wrap = panel.querySelector(".tv-lw-wrap");
        const container = panel.querySelector(".tv-lw-canvas");
        pinFullscreenHost(wrap, viewportSize.chartLeft || fullscreenChartLeftPx(), viewportSize.topbar);
        pinFullscreenHost(container, viewportSize.chartLeft || fullscreenChartLeftPx(), viewportSize.topbar);
        void panel.offsetWidth;
        return {
          width: viewportSize.width,
          height: viewportSize.height,
          viewportW: viewportSize.viewportW,
          viewportH: viewportSize.viewportH
        };
      };
      const fullscreenCanvasFillsViewport = (container) => {
        if (!container) return false;
        const targetW = Math.max(48, (window.innerWidth || 0) - fullscreenChartLeftPx());
        const plot = [...container.querySelectorAll("canvas")].find((c) => c instanceof HTMLCanvasElement && (c.width > 120 || c.getBoundingClientRect().width > 120));
        const cssW = plot ? plot.getBoundingClientRect().width : container.getBoundingClientRect().width;
        return cssW >= targetW * 0.9;
      };
      const resizeProviderHistoryChart = () => {
        const chart = provInst2.current;
        if (!chart) return;
        try {
          if (typeof chart.resize === "function") {
            chart.resize();
          }
          if (typeof chart.update === "function") {
            chart.update("none");
          }
        } catch (_error) {
        }
      };
      const measureLightweightChartSize = (container, options = {}) => {
        if (!container) return { width: 0, height: 0 };
        const wrap = container.closest(".tv-lw-wrap");
        const panel = container.closest(".tv-chart-panel") || document.querySelector("body > .tv-chart-panel");
        const forceFullscreen = options.forceFullscreen === true;
        const isFullscreenPanel = forceFullscreen || isMainChartFsActive(panel);
        if (isFullscreenPanel) {
          const locked = lockFullscreenChartBox(panel);
          if (locked) {
            return { width: locked.width, height: locked.height };
          }
          const viewportSize = measureFullscreenViewportSize(panel);
          if (viewportSize) {
            return { width: viewportSize.width, height: viewportSize.height };
          }
          const viewportW = window.innerWidth || 0;
          const viewportH = window.innerHeight || 0;
          return {
            width: Math.max(48, Math.floor(viewportW - fullscreenChartLeftPx())),
            height: Math.max(48, Math.floor(viewportH - 128))
          };
        }
        const hostRect = container.getBoundingClientRect();
        let width = Math.max(0, Math.floor(hostRect.width));
        let height = Math.max(0, Math.floor(hostRect.height));
        if (width >= 48 && height >= 48) {
          return { width, height };
        }
        const source = wrap || panel || container;
        const rect = source.getBoundingClientRect();
        width = Math.max(0, Math.floor(rect.width - 22));
        height = Math.max(0, Math.floor(rect.height - 30));
        if (width <= 0 || height <= 0) {
          width = Math.max(0, Math.floor(container.clientWidth));
          height = Math.max(0, Math.floor(container.clientHeight));
        }
        if (width < 48 || height < 48) {
          return { width: 0, height: 0 };
        }
        return { width, height };
      };
      const syncLightweightTimeScale = (chart, width, pointCount, options = {}) => {
        if (!chart || width <= 0 || pointCount < 2) return;
        const fullscreen = Boolean(options.fullscreen);
        const scaleWidth = fullscreen ? 80 : 72;
        const leftTickPad = 8;
        const horizontalPadding = fullscreen ? 12 : 16;
        const usableWidth = Math.max(180, width - scaleWidth - horizontalPadding - leftTickPad);
        const slots = Math.max(pointCount - 1, 1);
        const rawSpacing = usableWidth / slots;
        const barSpacing = fullscreen ? Math.max(0.5, rawSpacing) : Math.max(0.5, Math.min(32, rawSpacing));
        chart.timeScale().applyOptions({
          visible: true,
          barSpacing,
          minBarSpacing: 0.5,
          rightOffset: fullscreen ? 1 : 4,
          fixLeftEdge: false,
          fixRightEdge: true,
          timeVisible: false,
          secondsVisible: false,
          tickMarkFormatter: formatChartTimeTick
        });
        const rightBars = fullscreen ? 1 : 4;
        if (typeof chart.timeScale().setVisibleLogicalRange === "function") {
          chart.timeScale().setVisibleLogicalRange({
            from: 0,
            to: slots + rightBars
          });
        }
      };
      const resizeLightweightChartNow = (options = {}) => {
        const container = lwContainerRef.current;
        const chart = lwChartRef.current;
        const panel = container?.closest(".tv-chart-panel") || document.querySelector("body > .tv-chart-panel") || (options.forceFullscreen ? document.querySelector(".tv-chart-panel") : null);
        const isFullscreenPanel = isMainChartFsActive(panel) || options.forceFullscreen === true && fullscreenTargetRef.current === "main-chart";
        if (isFullscreenPanel && panel) {
          parkChartPanelOnBody(panel);
          applyFullscreenInline(panel);
          lockFullscreenChartBox(panel);
        }
        if (!container) return false;
        if (!chart) return false;
        let width;
        let height;
        if (isFullscreenPanel) {
          const viewportSize = measureFullscreenViewportSize(panel) || {
            width: Math.max(48, Math.floor((window.innerWidth || 0) - fullscreenChartLeftPx())),
            height: Math.max(48, Math.floor((window.innerHeight || 0) - 128))
          };
          width = viewportSize.width;
          height = viewportSize.height;
        } else {
          ({ width, height } = measureLightweightChartSize(container, { forceFullscreen: false }));
          const maxW = Math.max(0, Math.floor(container.clientWidth || container.getBoundingClientRect().width || 0));
          const maxH = Math.max(0, Math.floor(container.clientHeight || container.getBoundingClientRect().height || 0));
          if (maxW >= 48) width = Math.min(width, maxW);
          if (maxH >= 48) height = Math.min(height, maxH);
        }
        const axisSafePad = isFullscreenPanel ? 22 : 18;
        if (height >= 48 + axisSafePad) height -= axisSafePad;
        if (width <= 0 || height <= 0) return false;
        const host = container.firstElementChild;
        if (host && host.style) {
          host.style.setProperty("width", `${width}px`, "important");
          host.style.setProperty("height", `${height}px`, "important");
          host.style.setProperty("max-width", "none", "important");
          host.style.setProperty("max-height", "none", "important");
        }
        if (isFullscreenPanel) {
          pinFullscreenHost(
            container,
            fullscreenChartLeftPx(),
            measureFullscreenViewportSize(panel)?.topbar || 128
          );
          container.style.setProperty("width", `${width}px`, "important");
          container.style.setProperty("height", `${height}px`, "important");
          container.style.setProperty("max-width", "none", "important");
          container.style.setProperty("max-height", "none", "important");
        } else {
          ["width", "height", "max-width", "max-height", "position", "inset", "top", "right", "bottom", "left", "margin"].forEach((prop) => {
            container.style.removeProperty(prop);
          });
          container.style.width = "100%";
        }
        void container.offsetWidth;
        container.querySelectorAll("canvas").forEach((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) return;
          canvas.style.maxWidth = "none";
          canvas.style.maxHeight = "none";
          canvas.style.width = "";
          canvas.style.height = "";
        });
        if (typeof chart.applyOptions === "function") {
          chart.applyOptions({
            width,
            height,
            ...lightweightChartAxisOptions(isFullscreenPanel)
          });
        }
        if (typeof chart.resize === "function") {
          chart.resize(width, height, true);
        }
        syncLightweightTimeScale(chart, width, lwPointCountRef.current, { fullscreen: isFullscreenPanel });
        if (isFullscreenPanel) {
          return fullscreenCanvasFillsViewport(container);
        }
        return true;
      };
      const scheduleLightweightChartResize = (mode = "default") => {
        if (mode === "fullscreen") {
          fsResizeGenRef.current += 1;
        }
        const gen = fsResizeGenRef.current;
        const runInPage = () => {
          if (gen !== fsResizeGenRef.current) return;
          resizeLightweightChartNow();
        };
        if (mode === "fullscreen") {
          const stillMainFs = () => fullscreenTargetRef.current === "main-chart" || Boolean(document.querySelector("body > .tv-chart-panel")) || Boolean(document.fullscreenElement?.classList?.contains("tv-chart-panel"));
          const settle = (attempt) => {
            if (gen !== fsResizeGenRef.current) return;
            if (!stillMainFs()) return;
            const chartReady = Boolean(lwChartRef.current);
            const ok = resizeLightweightChartNow({ forceFullscreen: true });
            if (chartReady && ok && fullscreenCanvasFillsViewport(lwContainerRef.current) && attempt >= 2) {
              return;
            }
            if (attempt >= 90) return;
            window.requestAnimationFrame(() => settle(attempt + 1));
          };
          settle(0);
          queueMicrotask(() => settle(0));
          [40, 120, 280, 600, 1200, 2400].forEach((ms) => {
            window.setTimeout(() => {
              if (gen !== fsResizeGenRef.current) return;
              if (!stillMainFs()) return;
              resizeLightweightChartNow({ forceFullscreen: true });
            }, ms);
          });
          return;
        }
        runInPage();
        window.requestAnimationFrame(() => {
          runInPage();
          window.requestAnimationFrame(runInPage);
        });
        window.setTimeout(runInPage, 16);
        window.setTimeout(runInPage, 48);
        window.setTimeout(runInPage, 120);
      };
      const donutRef2 = useRef(null);
      const donutInst2 = useRef(null);
      const provRef2 = useRef(null);
      const provInst2 = useRef(null);
      const priceChartInstanceRef = useRef(null);
      const analyticsHistoryChartRef = useRef(null);
      const sourceCompareChartRef = useRef(null);
      const activityChartRef = useRef(null);
      const donutChartInstanceRef = useRef(null);
      const listingsChartInstanceRef = useRef(null);
      const roiChartInstanceRef = useRef(null);
      const providerChartInstanceRef = useRef(null);
      const viewerResourcesRef = useRef(null);
      const fullscreenRefs = useRef({});
      const fullscreenAncestorUnlockRef = useRef(null);
      const chartSlotRef = useRef(null);
      const chartPanelHomeRef = useRef(null);
      const bindFullscreenRef = (key) => (node) => {
        if (node) {
          fullscreenRefs.current[key] = node;
        }
      };
      const resolveFullscreenTarget = (key) => {
        const bound = fullscreenRefs.current[key];
        if (bound && document.contains(bound)) return bound;
        if (key === "main-chart") {
          return document.querySelector(".tv-chart-panel");
        }
        if (key === "price-history") {
          return document.querySelector(".tv-price-history-section");
        }
        return bound || null;
      };
      const parkChartPanelOnBody = (panel) => {
        if (!panel || panel.parentElement === document.body) return;
        chartPanelHomeRef.current = {
          parent: panel.parentElement,
          next: panel.nextSibling
        };
        document.body.appendChild(panel);
      };
      const restoreChartPanelHome = (panel) => {
        if (!panel) {
          chartPanelHomeRef.current = null;
          return;
        }
        const home = chartPanelHomeRef.current;
        const slot = chartSlotRef.current || (home?.parent?.classList?.contains("tv-chart-slot") ? home.parent : null) || document.querySelector(".tv-chart-slot");
        chartPanelHomeRef.current = null;
        if (slot) {
          if (panel.parentElement !== slot) slot.appendChild(panel);
          return;
        }
        if (!home?.parent) return;
        if (home.next && home.next.parentNode === home.parent) {
          home.parent.insertBefore(panel, home.next);
        } else {
          home.parent.appendChild(panel);
        }
      };
      const getFullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
      const requestElementFullscreen = (el) => {
        if (!el) return Promise.reject(new Error("missing element"));
        const request = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen;
        if (typeof request !== "function") {
          return Promise.reject(new Error("Fullscreen API unavailable"));
        }
        try {
          return Promise.resolve(request.call(el));
        } catch (error) {
          return Promise.reject(error);
        }
      };
      const exitDocumentFullscreen = () => {
        const active = getFullscreenElement();
        if (!active) return Promise.resolve();
        const exit = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen || document.msExitFullscreen;
        if (typeof exit !== "function") return Promise.resolve();
        try {
          return Promise.resolve(exit.call(document));
        } catch (_error) {
          return Promise.resolve();
        }
      };
      const setChartFsClass = (on) => {
        document.documentElement.classList.toggle("tv-chart-fs", Boolean(on));
      };
      const unlockFullscreenAncestors = (node) => {
        const restored = [];
        let el = node?.parentElement || null;
        while (el && el !== document.documentElement) {
          const style = el.style;
          if (style) {
            restored.push({
              el,
              transform: style.getPropertyValue("transform"),
              animation: style.getPropertyValue("animation"),
              filter: style.getPropertyValue("filter"),
              perspective: style.getPropertyValue("perspective"),
              overflow: style.getPropertyValue("overflow")
            });
            style.setProperty("transform", "none", "important");
            style.setProperty("animation", "none", "important");
            style.setProperty("filter", "none", "important");
            style.setProperty("perspective", "none", "important");
            style.setProperty("overflow", "visible", "important");
          }
          el = el.parentElement;
        }
        return () => {
          restored.forEach((entry) => {
            const { el: nodeEl } = entry;
            if (!nodeEl?.style) return;
            ["transform", "animation", "filter", "perspective", "overflow"].forEach((prop) => {
              const prev = entry[prop];
              if (prev) nodeEl.style.setProperty(prop, prev);
              else nodeEl.style.removeProperty(prop);
            });
          });
        };
      };
      const clearFullscreenInline = (node) => {
        if (!node?.style) return;
        node.classList.remove("is-native-fullscreen");
        setChartFsClass(false);
        if (typeof fullscreenAncestorUnlockRef.current === "function") {
          fullscreenAncestorUnlockRef.current();
          fullscreenAncestorUnlockRef.current = null;
        }
        if (node.classList.contains("tv-chart-panel") || node.parentElement === document.body) {
          restoreChartPanelHome(node);
        }
        [
          "width",
          "height",
          "max-width",
          "max-height",
          "min-width",
          "min-height",
          "margin",
          "inset",
          "top",
          "right",
          "bottom",
          "left",
          "position",
          "display",
          "flex-direction",
          "z-index",
          "overflow"
        ].forEach((prop) => node.style.removeProperty(prop));
        node.querySelectorAll(".tv-lw-stage, .tv-lw-wrap, .tv-lw-canvas, .tv-lw-canvas > *, .tv-lw-canvas table, .tv-draw-toolbar, .tv-provider-canvas").forEach((el) => {
          if (!el?.style) return;
          el.classList.remove("is-drawing-mode");
          [
            "width",
            "height",
            "max-width",
            "max-height",
            "min-width",
            "min-height",
            "flex",
            "display",
            "position",
            "inset",
            "top",
            "right",
            "bottom",
            "left",
            "margin",
            "transform",
            "animation",
            "z-index"
          ].forEach((prop) => el.style.removeProperty(prop));
        });
        node.querySelectorAll("canvas").forEach((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement) || !canvas.style) return;
          ["width", "height", "max-width", "max-height"].forEach((prop) => canvas.style.removeProperty(prop));
        });
      };
      const applyFullscreenInline = (node) => {
        if (!node?.style) return;
        setChartFsClass(true);
        if (typeof fullscreenAncestorUnlockRef.current === "function") {
          fullscreenAncestorUnlockRef.current();
        }
        if (node.classList.contains("tv-chart-panel")) {
          parkChartPanelOnBody(node);
        }
        fullscreenAncestorUnlockRef.current = unlockFullscreenAncestors(node);
        node.classList.add("is-native-fullscreen");
        node.style.setProperty("position", "fixed", "important");
        node.style.setProperty("inset", "0", "important");
        node.style.setProperty("top", "0", "important");
        node.style.setProperty("right", "0", "important");
        node.style.setProperty("bottom", "0", "important");
        node.style.setProperty("left", "0", "important");
        node.style.setProperty("width", "100vw", "important");
        node.style.setProperty("height", "100dvh", "important");
        node.style.setProperty("max-width", "none", "important");
        node.style.setProperty("max-height", "none", "important");
        node.style.setProperty("min-width", "100vw", "important");
        node.style.setProperty("min-height", "100dvh", "important");
        node.style.setProperty("margin", "0", "important");
        node.style.setProperty("display", "flex", "important");
        node.style.setProperty("flex-direction", "column", "important");
        node.style.setProperty("z-index", "2147483646", "important");
        prepareFullscreenChartLayout(node);
      };
      const finishFullscreenExit = (target) => {
        fsResizeGenRef.current += 1;
        fullscreenTargetRef.current = "";
        nativeFsEnteredRef.current = false;
        if (target) clearFullscreenInline(target);
        const parked = document.querySelector("body > .tv-chart-panel");
        if (parked && parked !== target) {
          clearFullscreenInline(parked);
        }
        setFullscreenTarget("");
        setDrawTool("cursor");
        scheduleLightweightChartResize();
        resizeProviderHistoryChart();
        window.requestAnimationFrame(() => {
          scheduleLightweightChartResize();
          resizeProviderHistoryChart();
        });
      };
      const toggleFullscreen = (key) => {
        const target = resolveFullscreenTarget(key);
        if (!target) return;
        const active = getFullscreenElement();
        const cssActive = target.classList.contains("is-native-fullscreen") || fullscreenTargetRef.current === key;
        if (active === target || !active && cssActive) {
          if (active === target) {
            exitDocumentFullscreen().then(() => finishFullscreenExit(target)).catch(() => finishFullscreenExit(target));
          } else {
            finishFullscreenExit(target);
          }
          return;
        }
        const enterFullscreen = () => {
          ignoreFsExitUntilRef.current = Date.now() + 600;
          nativeFsEnteredRef.current = false;
          fullscreenTargetRef.current = key;
          applyFullscreenInline(target);
          setFullscreenTarget(key);
          scheduleLightweightChartResize("fullscreen");
          resizeProviderHistoryChart();
          window.requestAnimationFrame(() => {
            resizeProviderHistoryChart();
            scheduleLightweightChartResize("fullscreen");
          });
          requestElementFullscreen(target).then(() => {
            scheduleLightweightChartResize("fullscreen");
            resizeProviderHistoryChart();
            window.requestAnimationFrame(() => resizeProviderHistoryChart());
          }).catch(() => {
            scheduleLightweightChartResize("fullscreen");
            resizeProviderHistoryChart();
          });
        };
        if (active && active !== target) {
          exitDocumentFullscreen().catch(() => void 0).finally(() => enterFullscreen());
          return;
        }
        enterFullscreen();
      };
      const toggleFullscreenRef = useRef(toggleFullscreen);
      toggleFullscreenRef.current = toggleFullscreen;
      useEffect(() => {
        const onFsButtonClick = (event) => {
          const btn = event.target?.closest?.(".tv-fullscreen-btn");
          if (!btn) return;
          const key = btn.closest(".tv-chart-panel") ? "main-chart" : btn.closest(".tv-price-history-section") ? "price-history" : "";
          if (!key) return;
          event.preventDefault();
          event.stopPropagation();
          toggleFullscreenRef.current?.(key);
        };
        document.addEventListener("click", onFsButtonClick, true);
        return () => document.removeEventListener("click", onFsButtonClick, true);
      }, []);
      const toggle3DViewer = () => {
        const modelUrl = resolveItemPageModelUrl(ITEM_DETAILS.title, skinModelUrl);
        if (!modelUrl) {
          return;
        }
        setViewerStatus((current) => current === "idle" ? "loading" : current);
        setIsViewerActive((current) => !current);
      };
      useEffect(() => {
        if (!IS_DYNAMIC_QUERY_ITEM || !SINGLE_ITEM_MARKET_HASH_NAME) {
          return void 0;
        }
        const controller = new AbortController();
        const catalogSearchName = HAS_WEAR_VARIANTS ? QUERY_BASE_NAME || QUERY_DISPLAY_NAME || ITEM_DETAILS.title : SINGLE_ITEM_MARKET_HASH_NAME;
        const params = new URLSearchParams({
          q: catalogSearchName,
          limit: "12"
        });
        fetch(`search_items.php?${params.toString()}`, { signal: controller.signal }).then((response) => {
          if (!response.ok) throw new Error(`Catalog lookup failed (${response.status})`);
          return response.json();
        }).then((json) => {
          if (controller.signal.aborted) return;
          const rows = Array.isArray(json?.items) ? json.items : [];
          setCatalogItem(
            pickCatalogSearchMatch(rows, SINGLE_ITEM_MARKET_HASH_NAME) || pickCatalogSearchMatch(rows, catalogSearchName) || pickCatalogSearchMatch(rows, ITEM_DETAILS.title) || rows[0] || null
          );
        }).catch(() => {
          if (!controller.signal.aborted) {
            setCatalogItem(null);
          }
        });
        return () => controller.abort();
      }, []);
      const activeWearOptions = useMemo(() => {
        if (!HAS_WEAR_VARIANTS) {
          return [];
        }
        let allowedWears = INSPECT_WEAR_OPTIONS.map((option) => option.wear);
        if (skinFloatRange) {
          allowedWears = resolveAvailableWearNames(
            skinFloatRange.min_float,
            skinFloatRange.max_float,
            allowedWears
          );
        }
        const allowed = new Set(allowedWears);
        return INSPECT_WEAR_OPTIONS.filter((option) => allowed.has(option.wear));
      }, [HAS_WEAR_VARIANTS, skinFloatRange]);
      useEffect(() => {
        if (!HAS_WEAR_VARIANTS || !activeWearOptions.length) {
          return;
        }
        const allowed = activeWearOptions.map((option) => option.wear);
        if (!allowed.includes(selectedInspectWear)) {
          const preferred = allowed.includes(DEFAULT_WEAR) ? DEFAULT_WEAR : allowed.includes("Factory New") ? "Factory New" : allowed[0];
          setSelectedInspectWear(preferred);
        }
      }, [HAS_WEAR_VARIANTS, activeWearOptions, selectedInspectWear]);
      const effectivePriceSource = priceSource === "all" && USES_EXACT_MARKET_ACTIVITY ? "steam" : priceSource;
      const wearTableSourceIds = WEAR_TABLE_SOURCES.map((entry) => entry.id);
      const wearTableSource = wearTableSourceIds.includes(effectivePriceSource) ? effectivePriceSource : "steam";
      const effectiveMarketHashName = USES_EXACT_MARKET_ACTIVITY ? HAS_WEAR_VARIANTS ? resolveExactMarketHashName(
        QUERY_BASE_NAME || QUERY_DISPLAY_NAME || ITEM_DETAILS.title,
        selectedInspectWear,
        true
      ) : QUERY_MARKET_HASH_NAME || SINGLE_ITEM_MARKET_HASH_NAME || resolveExactMarketHashName(
        QUERY_BASE_NAME || QUERY_DISPLAY_NAME || ITEM_DETAILS.title,
        selectedInspectWear,
        false
      ) : HAS_WEAR_VARIANTS ? `${ITEM_DETAILS.title} (${selectedInspectWear || initialInspectWear || DEFAULT_WEAR})` : SINGLE_ITEM_MARKET_HASH_NAME;
      const dynamicQuoteBaseName = QUERY_BASE_NAME || QUERY_DISPLAY_NAME || ITEM_DETAILS.title;
      const effectiveAnalyticsBundle = useMemo(() => {
        if (!USES_EXACT_MARKET_ACTIVITY) {
          const sanitized = sanitizeAnalyticsBundle(analyticsBundle, selectedInspectWear, dynamicQuoteBaseName, priceRange);
          if (sanitized?.series?.steam && seriesLooksSynthetic(sanitized.series.steam)) {
            delete sanitized.series.steam;
          }
          return sanitized;
        }
        const dynamic = buildDynamicAnalyticsBundle(singleMarketActivity, priceRange, effectiveMarketHashName, dynamicMarketQuotes, effectivePriceSource, dynamicQuoteBaseName, skinOriginName);
        const fallbackSeries = analyticsBundle?.series || {};
        const mergedSeries = { ...dynamic.series };
        for (const id of ["steam", "skinport", "csfloat", "white_market", "dmarket", "market_csgo", "shadowpay", "waxpeer", "mannco", "haloskins", "rapidskins"]) {
          const dynamicEntry = mergedSeries[id];
          const fallbackEntry = fallbackSeries[id];
          const resolved = resolveMergedMarketSeries(dynamicEntry, fallbackEntry, {
            isSteam: id === "steam",
            activity: singleMarketActivity,
            range: priceRange
          });
          if (resolved) {
            mergedSeries[id] = resolved;
          } else {
            delete mergedSeries[id];
          }
        }
        if (mergedSeries.steam && seriesLooksSynthetic(mergedSeries.steam)) {
          const fallbackSteam = fallbackSeries.steam;
          if (fallbackSteam && seriesPointCount(fallbackSteam) >= 2 && !seriesLooksSynthetic(fallbackSteam)) {
            mergedSeries.steam = fallbackSteam;
          } else if (seriesPointCount(mergedSeries.steam) < 2) {
            delete mergedSeries.steam;
          }
        }
        const rangeKey = String(priceRange || "ALL").toUpperCase();
        if ((rangeKey === "ALL" || rangeKey === "MAX") && mergedSeries.steam) {
          const lifetimeSteam = singleMarketActivity ? buildSingleMarketAnalyticsBundle(
            singleMarketActivity,
            "ALL",
            effectiveMarketHashName
          )?.series?.steam : null;
          const preferred = pickPreferredSteamSeries(
            lifetimeSteam || mergedSeries.steam,
            fallbackSeries.steam || mergedSeries.steam,
            "ALL",
            Number(
              dynamicMarketQuotes?.steam?.price || singleMarketActivity?.summary?.starting_price || singleMarketActivity?.summary?.suggested_price || mergedSeries.steam?.current_price || 0
            )
          );
          if (preferred && seriesPointCount(preferred) >= 2) {
            mergedSeries.steam = preferred;
          } else if (lifetimeSteam && seriesPointCount(lifetimeSteam) >= seriesPointCount(mergedSeries.steam)) {
            mergedSeries.steam = lifetimeSteam;
          }
        }
        return sanitizeAnalyticsBundle(
          { ...dynamic, series: alignProviderSeriesToSteamShape(mergedSeries), exact_dynamic: true },
          selectedInspectWear,
          dynamicQuoteBaseName,
          priceRange
        );
      }, [analyticsBundle, singleMarketActivity, priceRange, effectiveMarketHashName, dynamicMarketQuotes, effectivePriceSource, dynamicQuoteBaseName, selectedInspectWear, skinOriginName]);
      const effectiveRemoteProviders = useMemo(() => {
        const fromMain = providerSeriesFromBundle(
          effectiveAnalyticsBundle,
          selectedInspectWear,
          ITEM_DETAILS.title
        );
        const mainByName = new Map(
          fromMain.map((entry) => [String(entry?.name || "").toLowerCase(), entry])
        );
        const historyIsLifetime = isLifetimeProviderRange(provRange2);
        const mainIsLifetime = ["ALL", "MAX"].includes(String(priceRange || "").toUpperCase());
        const lifetimeSteamPoints = historyIsLifetime && singleMarketActivity ? normalizeAnalyticsSeriesPoints(
          buildSingleMarketAnalyticsBundle(
            singleMarketActivity,
            "ALL",
            effectiveMarketHashName
          )?.series?.steam?.points || []
        ) : [];
        let prepared = null;
        if (Array.isArray(remoteProviders) && remoteProviders.length) {
          prepared = sanitizeRemoteProviders(
            remoteProviders,
            providerHistoryReferencePrice(remoteProviders),
            ITEM_DETAILS.title
          );
        } else if (fromMain.length) {
          prepared = mainIsLifetime && !historyIsLifetime ? fromMain.map((entry) => ({
            ...entry,
            points: filterProviderPointsByRange(entry?.points || [], provRange2)
          })).filter((entry) => Array.isArray(entry.points) && entry.points.length >= 2) : fromMain.slice();
        } else if (remoteProviders === void 0) {
          return void 0;
        } else if (Array.isArray(remoteProviders)) {
          return null;
        } else {
          return null;
        }
        if (!prepared || !prepared.length) {
          return prepared;
        }
        const merged = prepared.map((entry) => {
          const key = String(entry?.name || "").toLowerCase();
          const isSteam = key === "steam";
          const remoteCount = Array.isArray(entry?.points) ? entry.points.length : 0;
          if (isSteam && lifetimeSteamPoints.length >= 2) {
            return {
              ...entry,
              points: lifetimeSteamPoints,
              current_price: lifetimeSteamPoints[lifetimeSteamPoints.length - 1]?.price ?? entry.current_price,
              color: entry.color || marketColor(entry.name)
            };
          }
          const mainEntry = mainByName.get(key);
          const mainCount = Array.isArray(mainEntry?.points) ? mainEntry.points.length : 0;
          const mainClobbersShortRemote = mainIsLifetime && !historyIsLifetime && remoteCount >= 2;
          if (mainEntry && mainCount >= 2 && !mainClobbersShortRemote && (mainIsLifetime || historyIsLifetime || mainCount >= remoteCount)) {
            return {
              ...entry,
              points: mainEntry.points,
              current_price: mainEntry.current_price ?? entry.current_price,
              color: entry.color || mainEntry.color || marketColor(entry.name)
            };
          }
          return entry;
        });
        mainByName.forEach((mainEntry, key) => {
          if (!key || !Array.isArray(mainEntry.points) || mainEntry.points.length < 2) {
            return;
          }
          if (mainIsLifetime && !historyIsLifetime) {
            return;
          }
          if (merged.some((entry) => String(entry?.name || "").toLowerCase() === key)) {
            return;
          }
          merged.push({
            ...mainEntry,
            color: mainEntry.color || marketColor(mainEntry.name)
          });
        });
        if (lifetimeSteamPoints.length >= 2 && !merged.some((entry) => String(entry?.name || "").toLowerCase() === "steam")) {
          merged.unshift({
            name: "Steam",
            color: marketColor("Steam"),
            points: lifetimeSteamPoints,
            current_price: lifetimeSteamPoints[lifetimeSteamPoints.length - 1]?.price || null
          });
        }
        const filtered = merged.filter((entry) => Array.isArray(entry?.points) && entry.points.length >= 2);
        const withBackfill = enrichProvidersWithSteamBackfill(
          filtered,
          historyIsLifetime ? "ALL" : provRange2
        );
        const enriched = enrichRemoteProvidersFromSteam(withBackfill);
        return ensureProvidersFromLiveQuotes(
          enriched,
          dynamicMarketQuotes,
          ITEM_DETAILS.title,
          historyIsLifetime ? "ALL" : provRange2
        );
      }, [
        effectiveAnalyticsBundle,
        selectedInspectWear,
        ITEM_DETAILS.title,
        remoteProviders,
        priceRange,
        provRange2,
        singleMarketActivity,
        effectiveMarketHashName,
        dynamicMarketQuotes
      ]);
      useEffect(() => {
        if (!QUERY_FULL_MARKET_NAME || USES_EXACT_MARKET_ACTIVITY) {
          setItemLookupResolved(true);
          return void 0;
        }
        let cancelled = false;
        fetch(`resolve_item.php?market_hash_name=${encodeURIComponent(QUERY_FULL_MARKET_NAME)}`).then((response) => {
          if (!response.ok) throw new Error(`Item lookup request failed (${response.status})`);
          return response.json();
        }).then((json) => {
          if (cancelled) return;
          if (json && Number(json.item_id) > 0) {
            setTrackedItemId(Number(json.item_id));
          }
          setItemLookupResolved(true);
        }).catch(() => {
          if (!cancelled) {
            setItemLookupResolved(true);
          }
        });
        return () => {
          cancelled = true;
        };
      }, []);
      useEffect(() => {
        let alive = true;
        const targetTitle = normalizeMarketName(ITEM_DETAILS.title);
        const lookupNames = itemPageModelLookupNames(ITEM_DETAILS.title);
        const manifestTargets = [
          "assets/models/skins/manifest.json",
          "assets/models/agents/manifest.json",
          "assets/models/keychains/manifest.json"
        ];
        setSkinModelUrl("");
        setSkinModelMeta(null);
        if (!targetTitle) {
          return void 0;
        }
        const helper = window.CS2SkinViewer || {};
        const loadCrafterLibrary = typeof helper.loadCrafterBatchLibrary === "function" ? helper.loadCrafterBatchLibrary() : fetch("get_crafter_batch_library.php", {
          cache: "no-store",
          headers: { Accept: "application/json" }
        }).then((response) => response.ok ? response.json() : null).then((payload) => Array.isArray(payload?.items) ? payload.items : []).catch(() => []);
        Promise.all([
          Promise.all(
            manifestTargets.map((manifestUrl) => fetch(`${manifestUrl}?v=${encodeURIComponent(targetTitle)}`, {
              cache: "no-store",
              headers: { Accept: "application/json" }
            }).then((response) => response.ok ? response.json() : null).catch(() => null))
          ),
          loadCrafterLibrary
        ]).then(([payloads, crafterItems]) => {
          if (!alive) return;
          const entries = payloads.flatMap((payload) => normalizeModelManifestEntries(payload));
          const match = resolveManifestModelEntry(entries, lookupNames);
          let nextUrl = "";
          let nextMeta = null;
          if (match?.model_url) {
            const manifestWeapon = stripItemNamePrefix(String(match.market_name || "").split("|")[0]);
            const pageWeapon = stripItemNamePrefix(String(ITEM_DETAILS.title || "").split("|")[0]);
            const isCharmModelUrl = /keychains\//i.test(String(match.model_url || "")) || /\bcharm\b/i.test(String(match.market_name || ITEM_DETAILS.title || ""));
            const weaponMatches = !manifestWeapon || !pageWeapon || normalizeMarketName(manifestWeapon) === normalizeMarketName(pageWeapon) || isCharmModelUrl;
            if (weaponMatches) {
              nextMeta = match;
              nextUrl = String(match.model_url);
            }
          }
          const crafterEntry = resolveCrafterLibraryBakedEntry(crafterItems, lookupNames);
          const bakedUrl = String(crafterEntry?.model_url || "").trim();
          if (bakedUrl && (!nextUrl || isUnpaintedBaseModelUrl(nextUrl))) {
            nextUrl = bakedUrl;
            if (!nextMeta) {
              nextMeta = crafterEntry;
            }
          }
          if (nextMeta) {
            setSkinModelMeta(nextMeta);
          }
          if (nextUrl) {
            setSkinModelUrl(nextUrl);
          }
        }).catch(() => void 0);
        return () => {
          alive = false;
        };
      }, [ITEM_DETAILS.title]);
      useEffect(() => {
        const syncSummaryTableOffset = () => {
          if (window.innerWidth <= 900) {
            setSummaryTableOffset(0);
            return;
          }
          const infoNode = previewInfoRef.current;
          const imageNode = previewImageRef.current;
          if (!infoNode || !imageNode) {
            setSummaryTableOffset(0);
            return;
          }
          const infoRect = infoNode.getBoundingClientRect();
          const imageRect = imageNode.getBoundingClientRect();
          let nextOffset = Math.round(imageRect.top - infoRect.top);
          if (nextOffset <= 0) {
            const titleNode = infoNode.querySelector(".item-title");
            const collectionNode = infoNode.querySelector(".item-collection");
            if (titleNode && collectionNode) {
              const titleRect = titleNode.getBoundingClientRect();
              const collectionRect = collectionNode.getBoundingClientRect();
              nextOffset = Math.round(collectionRect.bottom - titleRect.top + 12);
            } else if (typeof imageNode.offsetTop === "number") {
              nextOffset = Math.round(imageNode.offsetTop);
            }
          }
          nextOffset = Math.max(0, nextOffset);
          setSummaryTableOffset(nextOffset);
        };
        const imageElement = previewImageRef.current ? previewImageRef.current.querySelector("img") : null;
        syncSummaryTableOffset();
        const rafId = window.requestAnimationFrame(syncSummaryTableOffset);
        const timeoutId = window.setTimeout(syncSummaryTableOffset, 140);
        window.addEventListener("resize", syncSummaryTableOffset);
        imageElement?.addEventListener("load", syncSummaryTableOffset);
        return () => {
          window.cancelAnimationFrame(rafId);
          window.clearTimeout(timeoutId);
          window.removeEventListener("resize", syncSummaryTableOffset);
          imageElement?.removeEventListener("load", syncSummaryTableOffset);
        };
      }, [ITEM_DETAILS.title, ITEM_DETAILS.collectionName, IS_INVENTORY_CONTEXT, selectedInspectWear]);
      useEffect(() => {
        const pageTitle = String(ITEM_DETAILS.title || "").trim();
        if (pageTitle) {
          document.title = `${pageTitle} - CS.PRICE`;
        }
      }, [ITEM_DETAILS.title]);
      useEffect(() => {
        const syncFullscreenTarget = () => {
          const activeElement = getFullscreenElement();
          if (!activeElement) {
            if (Date.now() < ignoreFsExitUntilRef.current && !nativeFsEnteredRef.current) {
              return;
            }
            nativeFsEnteredRef.current = false;
            const key = fullscreenTargetRef.current;
            const node = key ? resolveFullscreenTarget(key) : null;
            if (node?.classList.contains("is-native-fullscreen") || document.querySelector("body > .tv-chart-panel")) {
              finishFullscreenExit(node);
            } else {
              Object.values(fullscreenRefs.current).forEach((entry) => clearFullscreenInline(entry));
              setFullscreenTarget("");
              setDrawTool("cursor");
              scheduleLightweightChartResize();
              resizeProviderHistoryChart();
            }
            return;
          }
          const matchedEntry = Object.entries(fullscreenRefs.current).find(([, node]) => node === activeElement);
          if (matchedEntry?.[1]) {
            nativeFsEnteredRef.current = true;
            applyFullscreenInline(matchedEntry[1]);
          }
          setFullscreenTarget(matchedEntry ? matchedEntry[0] : "");
          scheduleLightweightChartResize("fullscreen");
          resizeProviderHistoryChart();
          window.requestAnimationFrame(() => resizeProviderHistoryChart());
        };
        const onFullscreenKeyDown = (event) => {
          if (event.key !== "Escape") return;
          if (getFullscreenElement()) return;
          const key = fullscreenTargetRef.current || "";
          if (!key) return;
          const node = resolveFullscreenTarget(key);
          finishFullscreenExit(node || null);
        };
        document.addEventListener("fullscreenchange", syncFullscreenTarget);
        document.addEventListener("webkitfullscreenchange", syncFullscreenTarget);
        document.addEventListener("keydown", onFullscreenKeyDown);
        return () => {
          document.removeEventListener("fullscreenchange", syncFullscreenTarget);
          document.removeEventListener("webkitfullscreenchange", syncFullscreenTarget);
          document.removeEventListener("keydown", onFullscreenKeyDown);
          setChartFsClass(false);
          if (typeof fullscreenAncestorUnlockRef.current === "function") {
            fullscreenAncestorUnlockRef.current();
            fullscreenAncestorUnlockRef.current = null;
          }
        };
      }, [trackedItemId]);
      useEffect(() => () => {
        const resources = viewerResourcesRef.current;
        if (!resources) return;
        resources.isActive = false;
        if (resources.frameId) {
          window.cancelAnimationFrame(resources.frameId);
        }
        resources.resizeObserver?.disconnect();
        if (resources.resizeHandler) {
          window.removeEventListener("resize", resources.resizeHandler);
        }
        if (resources.modelRoot) {
          resources.modelRoot.traverse((child) => {
            if (child.geometry && typeof child.geometry.dispose === "function") {
              child.geometry.dispose();
            }
            if (child.material) {
              disposeViewerMaterials(child.material);
            }
          });
        }
        resources.controls?.dispose();
        resources.renderer?.dispose();
        if (resources.container && resources.renderer?.domElement?.parentNode === resources.container) {
          resources.container.removeChild(resources.renderer.domElement);
        }
        viewerResourcesRef.current = null;
      }, [trackedItemId]);
      useEffect(() => {
        setQualityRows(createEmptyQualityRows());
      }, [dynamicQuoteBaseName]);
      useEffect(() => {
        if (!itemLookupResolved || !HAS_WEAR_VARIANTS || !dynamicQuoteBaseName) {
          return void 0;
        }
        let cancelled = false;
        const originNow = () => String(skinOriginRef.current || QUERY_ORIGIN || "").trim();
        const applySteamWearRows = (liveRows) => {
          if (cancelled || !Array.isArray(liveRows) || !liveRows.length) return;
          const origin = originNow();
          setQualityRows((prev) => {
            const nextRows = applyLiveWearRows(prev, liveRows, { replaceMissing: true });
            setDynamicMarketQuotes((current) => mergeSteamWearQuotes(current, nextRows, dynamicQuoteBaseName, selectedInspectWear, origin));
            return nextRows;
          });
        };
        const fetchWearRows = (cacheOnly = false) => {
          const cacheParam = cacheOnly ? "&cache_only=1" : "&prefer_live=1&force_live=1";
          const origin = originNow();
          const originParam = origin ? `&origin=${encodeURIComponent(origin)}` : "";
          return fetchJsonWithTimeout(
            `get_steam_wear_prices.php?lookup_name=${encodeURIComponent(dynamicQuoteBaseName)}${cacheParam}${originParam}&_=${Date.now()}`,
            { cache: "no-store" },
            cacheOnly ? 2e4 : 18e3
          ).then((json) => {
            if (json?.error) throw new Error(json.error);
            applySteamWearRows(json?.quality_rows || []);
          });
        };
        const fillMissingStatTrakRows = () => {
          const origin = originNow();
          if (!itemSupportsStatTrak(dynamicQuoteBaseName, origin)) {
            return Promise.resolve();
          }
          return fetchSteamStatTrakQuoteLookup(dynamicQuoteBaseName, true, origin).then((lookup) => {
            if (cancelled || !lookup || !Object.keys(lookup).length) return;
            setQualityRows((prev) => {
              const nextRows = patchQualityRowsWithStatTrakLookup(dynamicQuoteBaseName, prev, lookup, false);
              setDynamicMarketQuotes((current) => mergeSteamWearQuotes(current, nextRows, dynamicQuoteBaseName, selectedInspectWear, origin));
              return nextRows;
            });
          }).catch(() => {
          });
        };
        const fillMissingSouvenirRows = () => {
          const origin = originNow();
          if (!itemSupportsSouvenir(dynamicQuoteBaseName, origin)) {
            return Promise.resolve();
          }
          return fetchSteamSouvenirQuoteLookup(dynamicQuoteBaseName, true, origin).then((lookup) => {
            if (cancelled || !lookup || !Object.keys(lookup).length) return;
            setQualityRows((prev) => {
              const nextRows = patchQualityRowsWithSouvenirLookup(dynamicQuoteBaseName, prev, lookup);
              setDynamicMarketQuotes((current) => mergeSteamWearQuotes(current, nextRows, dynamicQuoteBaseName, selectedInspectWear, origin));
              return nextRows;
            });
          }).catch(() => {
          });
        };
        const fillFromQuoteLookups = (preferLive) => {
          const origin = originNow();
          const wearLookup = fetchSteamWearQuoteLookup(dynamicQuoteBaseName, preferLive);
          const stLookup = itemSupportsStatTrak(dynamicQuoteBaseName, origin) ? fetchSteamStatTrakQuoteLookup(dynamicQuoteBaseName, preferLive, origin) : Promise.resolve({});
          const svLookup = itemSupportsSouvenir(dynamicQuoteBaseName, origin) ? fetchSteamSouvenirQuoteLookup(dynamicQuoteBaseName, preferLive, origin) : Promise.resolve({});
          return Promise.all([wearLookup, stLookup, svLookup]).then(([wears, stattraks, souvenirs]) => {
            if (cancelled) return;
            setQualityRows((prev) => {
              let nextRows = patchQualityRowsWithSteamWearLookup(dynamicQuoteBaseName, prev, wears, preferLive);
              nextRows = patchQualityRowsWithStatTrakLookup(dynamicQuoteBaseName, nextRows, stattraks, preferLive);
              nextRows = patchQualityRowsWithSouvenirLookup(dynamicQuoteBaseName, nextRows, souvenirs);
              setDynamicMarketQuotes((current) => mergeSteamWearQuotes(
                current,
                nextRows,
                dynamicQuoteBaseName,
                selectedInspectWear,
                origin
              ));
              return nextRows;
            });
          }).catch(() => {
          });
        };
        fetchWearRows(false).catch(() => {
        }).finally(() => {
          if (cancelled) return;
          fillFromQuoteLookups(false);
          fillMissingStatTrakRows();
          fillMissingSouvenirRows();
        });
        return () => {
          cancelled = true;
        };
      }, [itemLookupResolved, dynamicQuoteBaseName, HAS_WEAR_VARIANTS]);
      useEffect(() => {
        if (!itemLookupResolved || !HAS_WEAR_VARIANTS || !dynamicQuoteBaseName) {
          return void 0;
        }
        if (!souvenirLookupReady && !skinOriginName && !QUERY_ORIGIN) {
          return void 0;
        }
        let cancelled = false;
        const origin = String(skinOriginName || QUERY_ORIGIN || "").trim();
        const variantKind = resolveWearVariantKind(dynamicQuoteBaseName, origin);
        const fetchVariant = (preferLive) => variantKind === "stattrak" ? fetchSteamStatTrakQuoteLookup(dynamicQuoteBaseName, preferLive, origin) : variantKind === "souvenir" ? fetchSteamSouvenirQuoteLookup(dynamicQuoteBaseName, preferLive, origin) : Promise.resolve({});
        const secondaryLookup = fetchVariant(false).then((cached) => {
          if (cancelled) return cached;
          const cachedCount = Object.keys(cached || {}).length;
          if (cachedCount >= INSPECT_WEAR_OPTIONS.length) return cached;
          return fetchVariant(true).then((live) => Object.keys(live || {}).length ? { ...cached || {}, ...live } : cached);
        });
        secondaryLookup.then((lookup) => {
          if (cancelled || !lookup || !Object.keys(lookup).length) return;
          setQualityRows((prev) => {
            const nextRows = variantKind === "stattrak" ? patchQualityRowsWithStatTrakLookup(dynamicQuoteBaseName, prev, lookup, false) : patchQualityRowsWithSouvenirLookup(dynamicQuoteBaseName, prev, lookup);
            setDynamicMarketQuotes((current) => mergeSteamWearQuotes(
              current,
              nextRows,
              dynamicQuoteBaseName,
              selectedInspectWear,
              origin
            ));
            return nextRows;
          });
        }).catch(() => {
        });
        return () => {
          cancelled = true;
        };
      }, [itemLookupResolved, dynamicQuoteBaseName, HAS_WEAR_VARIANTS, skinOriginName, souvenirLookupReady]);
      useEffect(() => {
        if (!HAS_WEAR_VARIANTS || !dynamicQuoteBaseName) return;
        setDynamicMarketQuotes((current) => {
          if (!current || typeof current !== "object") return current || {};
          const wear = selectedInspectWear || DEFAULT_WEAR;
          const next = { ...current || {} };
          let changed = false;
          const providerIds = ["steam", ...WEAR_TABLE_MARKETPLACES.map((entry) => entry.id)];
          providerIds.forEach((sourceId) => {
            const wearHash = sourceId === "steam" ? buildSteamWearMarketHashName(dynamicQuoteBaseName, wear) : buildWearMarketHashName(dynamicQuoteBaseName, wear);
            const selectedQuote = quoteForMarketHash(current?.wears?.[sourceId], wearHash) || (sourceId === "steam" ? null : quoteForMarketHash(current?.wears?.[sourceId], buildWearMarketHashName(dynamicQuoteBaseName, wear)));
            if (!selectedQuote) return;
            if (selectedQuote === current?.[sourceId]) return;
            next[sourceId] = selectedQuote;
            changed = true;
          });
          return changed ? next : current;
        });
      }, [selectedInspectWear, dynamicQuoteBaseName, HAS_WEAR_VARIANTS]);
      useEffect(() => {
        if (USES_EXACT_MARKET_ACTIVITY) {
          setSteamSnapshot(null);
          return void 0;
        }
        if (!itemLookupResolved || !trackedItemId) return void 0;
        let cancelled = false;
        fetch(`get_steam_snapshot.php?item_id=${trackedItemId}&lookup_name=${encodeURIComponent(ITEM_DETAILS.title)}`).then((response) => {
          if (!response.ok) throw new Error(`Steam snapshot request failed (${response.status})`);
          return response.json();
        }).then((json) => {
          if (cancelled) return;
          if (json && json.error) throw new Error(json.error);
          setSteamSnapshot(json);
          if (!HAS_WEAR_VARIANTS) {
            setQualityRows((prev) => applyLiveWearRows(prev, json.quality_rows || []));
          }
        }).catch(() => {
          if (cancelled) return;
          setSteamSnapshot(null);
        });
        return () => {
          cancelled = true;
        };
      }, [itemLookupResolved, trackedItemId, singleMarketActivity]);
      useEffect(() => {
        if (USES_EXACT_MARKET_ACTIVITY) {
          setSkinportSnapshot(null);
          return void 0;
        }
        if (!itemLookupResolved || !trackedItemId) return void 0;
        let cancelled = false;
        fetch(`get_skinport_snapshot.php?item_id=${trackedItemId}&lookup_name=${encodeURIComponent(ITEM_DETAILS.title)}`).then((response) => {
          if (!response.ok) throw new Error(`Skinport snapshot request failed (${response.status})`);
          return response.json();
        }).then((json) => {
          if (cancelled) return;
          if (json && json.error) throw new Error(json.error);
          setSkinportSnapshot(json);
        }).catch(() => {
          if (cancelled) return;
          setSkinportSnapshot(null);
        });
        return () => {
          cancelled = true;
        };
      }, [itemLookupResolved, trackedItemId]);
      const inspectBaseName = dynamicQuoteBaseName || QUERY_BASE_NAME || ITEM_DETAILS.title;
      useEffect(() => {
        if (!itemLookupResolved) return void 0;
        let cancelled = false;
        setInspectLoading(true);
        const inspectQuery = inspectBaseName ? `get_steam_inspect_links.php?base_name=${encodeURIComponent(inspectBaseName)}` : trackedItemId ? `get_steam_inspect_links.php?item_id=${trackedItemId}` : "";
        if (!inspectQuery) {
          setInspectLinks({});
          setInspectLoading(false);
          return void 0;
        }
        fetch(inspectQuery).then((response) => {
          if (!response.ok) throw new Error(`Inspect link request failed (${response.status})`);
          return response.json();
        }).then((json) => {
          if (cancelled) return;
          if (json && json.error) throw new Error(json.error);
          setInspectLinks(json.links || {});
          setInspectLoading(false);
        }).catch(() => {
          if (cancelled) return;
          setInspectLinks({});
          setInspectLoading(false);
        });
        return () => {
          cancelled = true;
        };
      }, [itemLookupResolved, trackedItemId, inspectBaseName]);
      useEffect(() => {
        if (!itemLookupResolved) return void 0;
        const base = String(inspectBaseName || ITEM_DETAILS.title || "").trim();
        const looksLikePaintedSkin = HAS_WEAR_VARIANTS || base.includes("|") && !itemTitleExcludesWearVariants(base) && titleLooksLikeWeaponFinish(base);
        if (!base || !looksLikePaintedSkin) {
          setCraftSkinEcon(null);
          setCraftEconLoading(false);
          return void 0;
        }
        let cancelled = false;
        setCraftEconLoading(true);
        const lookupName = HAS_WEAR_VARIANTS ? buildWearMarketHashName(base, selectedInspectWear || DEFAULT_WEAR) : base;
        fetch("get_craft_econ_lookup.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skin_market_hash_name: lookupName })
        }).then((response) => response.ok ? response.json() : null).then((json) => {
          if (cancelled) return;
          setCraftSkinEcon(json?.skin || null);
          setCraftEconLoading(false);
        }).catch(() => {
          if (cancelled) return;
          setCraftSkinEcon(null);
          setCraftEconLoading(false);
        });
        return () => {
          cancelled = true;
        };
      }, [itemLookupResolved, inspectBaseName, HAS_WEAR_VARIANTS]);
      useEffect(() => {
        if (!USES_EXACT_MARKET_ACTIVITY) {
          setSingleMarketActivity(null);
          return void 0;
        }
        if (!effectiveMarketHashName) {
          return void 0;
        }
        const controller = new AbortController();
        setAnalyticsLoading(true);
        setAnalyticsError("");
        fetch(`get_steam_market_activity.php?market_hash_name=${encodeURIComponent(effectiveMarketHashName)}`, { signal: controller.signal }).then((response) => {
          if (!response.ok) throw new Error(`Steam market activity request failed (${response.status})`);
          return response.json();
        }).then((json) => {
          if (controller.signal.aborted) return;
          if (!json?.success) {
            throw new Error(json?.error || "Steam market activity is unavailable.");
          }
          setSingleMarketActivity(json);
          setAnalyticsLoading(false);
        }).catch((error) => {
          if (controller.signal.aborted || error?.name === "AbortError") return;
          setSingleMarketActivity(null);
          setAnalyticsLoading(false);
          setAnalyticsError(error?.message || "Steam market activity is unavailable.");
        });
        return () => {
          controller.abort();
        };
      }, [effectiveMarketHashName]);
      useEffect(() => {
        if (!HAS_WEAR_VARIANTS || !dynamicQuoteBaseName) {
          setWearHistories({});
          return void 0;
        }
        let cancelled = false;
        setWearHistories({});
        (async () => {
          for (const option of INSPECT_WEAR_OPTIONS) {
            if (cancelled) return;
            const hashName = buildSteamWearMarketHashName(dynamicQuoteBaseName, option.wear);
            if (!hashName) continue;
            try {
              const json = await fetchJsonWithTimeout(
                `get_steam_market_activity.php?market_hash_name=${encodeURIComponent(hashName)}`,
                { cache: "no-store" },
                45e3
              );
              if (cancelled) return;
              if (!json?.success) continue;
              const points = normalizeAnalyticsSeriesPoints(resolveActivityHistoryForRange(json, priceRange) || []);
              if (points.length < 2) continue;
              setWearHistories((prev) => Object.assign({}, prev, { [option.wear]: points }));
            } catch (_error) {
            }
          }
        })();
        return () => {
          cancelled = true;
        };
      }, [HAS_WEAR_VARIANTS, dynamicQuoteBaseName, priceRange]);
      useEffect(() => {
        if (USES_EXACT_MARKET_ACTIVITY && priceSource === "all") {
          setPriceSource("steam");
        }
      }, [priceSource]);
      useEffect(() => {
        if (!itemLookupResolved) {
          setDynamicMarketQuotes({});
          return void 0;
        }
        const quoteMarketHash = effectiveMarketHashName || SINGLE_ITEM_MARKET_HASH_NAME;
        if (!quoteMarketHash) {
          setDynamicMarketQuotes({});
          return void 0;
        }
        let alive = true;
        const controller = new AbortController();
        const quoteMarketNames = buildDynamicQuoteMarketNames(dynamicQuoteBaseName, quoteMarketHash, HAS_WEAR_VARIANTS, INSPECT_WEAR_OPTIONS, skinOriginName);
        const selectedWearMarketNames = Array.from(new Set([
          quoteMarketHash,
          buildWearMarketHashName(dynamicQuoteBaseName, selectedInspectWear),
          ...itemSupportsStatTrak(dynamicQuoteBaseName, skinOriginName) ? [buildStatTrakMarketHashName(dynamicQuoteBaseName, selectedInspectWear)] : [],
          ...itemSupportsSouvenir(dynamicQuoteBaseName, skinOriginName) ? [buildSouvenirMarketHashName(dynamicQuoteBaseName, selectedInspectWear)] : []
        ].filter(Boolean)));
        const floatMarketNames = HAS_WEAR_VARIANTS && quoteMarketNames.length ? quoteMarketNames : selectedWearMarketNames;
        const steamQuoteMarketNames = buildSteamDynamicQuoteMarketNames(dynamicQuoteBaseName, quoteMarketHash, HAS_WEAR_VARIANTS, INSPECT_WEAR_OPTIONS, skinOriginName);
        const quoteRange = priceRange === "ALL" || priceRange === "MAX" ? "all" : String(priceRange || "30d").toLowerCase();
        const quoteBody = (source, options = {}) => JSON.stringify({
          market_hash_names: options.marketHashNames ?? (source === "steam" ? steamQuoteMarketNames : quoteMarketNames),
          source,
          range: quoteRange,
          prefer_live: options.preferLive ?? source === "skinport",
          allow_live_refresh: options.allowLiveRefresh ?? source === "skinport",
          db_cache_first: options.dbCacheFirst ?? (source === "steam" || source === "skinport"),
          max_cache_age_hours: source === "steam" ? 24 : 6,
          skip_catalog_fallback: true,
          steam_listing_fallback: options.steamListingFallback ?? false,
          steam_listing_first: false,
          steam_listing_fallback_limit: options.steamListingFallback ? 1 : 0
        });
        const floatBody = (names, cacheOnly = true) => JSON.stringify({
          market_hash_names: names,
          cache_only: cacheOnly,
          prefer_live: !cacheOnly,
          ignore_auctions: true,
          require_verified_buy_now: true,
          listing_fetch_limit: 100
        });
        const postJson = (url, body, timeoutMs = 12e3) => fetchJsonWithTimeout(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal
        }, timeoutMs);
        const mergeQuoteLookup = (sourceId, lookup) => {
          if (!alive) return;
          const normalizedLookup = lookup && typeof lookup === "object" ? lookup : {};
          const selectedQuote = quoteForMarketHash(normalizedLookup, quoteMarketHash) || null;
          setDynamicMarketQuotes((current) => {
            const previous = current?.[sourceId] || null;
            let nextQuote = selectedQuote || (positivePrice(previous?.price) ? previous : null);
            return {
              ...current || {},
              [sourceId]: nextQuote,
              wears: {
                ...current && current.wears || {},
                [sourceId]: {
                  ...current?.wears?.[sourceId] || {},
                  ...normalizedLookup
                }
              }
            };
          });
        };
        const loadProvider = async (sourceId, request) => {
          try {
            const json = await request();
            if (!alive) return;
            mergeQuoteLookup(sourceId, normalizeQuoteItemsByHash(json));
          } catch {
            if (!alive) return;
          }
        };
        loadProvider("steam", () => postJson("get_roi_prices_cached.php", quoteBody("steam"), 12e3));
        loadProvider("skinport", () => postJson("get_roi_prices_cached.php", quoteBody("skinport", {
          preferLive: true,
          allowLiveRefresh: true,
          dbCacheFirst: false
        }), 15e3));
        loadProvider("steam", () => postJson("get_roi_prices_cached.php", quoteBody("steam", {
          marketHashNames: [quoteMarketHash],
          preferLive: true,
          allowLiveRefresh: true,
          dbCacheFirst: false,
          steamListingFallback: true
        }), 15e3));
        loadProvider("white_market", () => postJson("get_white_market_prices.php", JSON.stringify({
          market_hash_names: quoteMarketNames,
          cache_only: false,
          prefer_live: true
        }), 2e4));
        loadProvider("dmarket", () => postJson("get_dmarket_prices.php", JSON.stringify({
          market_hash_names: quoteMarketNames,
          cache_only: false,
          prefer_live: true,
          max_live_requests: quoteMarketNames.length
        }), 25e3));
        loadProvider("market_csgo", () => postJson("get_market_csgo_prices.php", JSON.stringify({
          market_hash_names: quoteMarketNames,
          cache_only: false,
          prefer_live: true
        }), 25e3));
        loadProvider("shadowpay", () => postJson("get_shadowpay_prices.php", JSON.stringify({
          market_hash_names: quoteMarketNames,
          cache_only: false,
          prefer_live: true
        }), 25e3));
        loadProvider("waxpeer", () => postJson("get_waxpeer_prices.php", JSON.stringify({
          market_hash_names: quoteMarketNames,
          cache_only: false,
          prefer_live: true
        }), 25e3));
        loadProvider("mannco", () => postJson("get_mannco_prices.php", JSON.stringify({
          market_hash_names: quoteMarketNames,
          cache_only: false,
          prefer_live: true
        }), 25e3));
        loadProvider("haloskins", () => postJson("get_haloskins_prices.php", JSON.stringify({
          market_hash_names: quoteMarketNames,
          cache_only: false,
          prefer_live: true
        }), 25e3));
        loadProvider("rapidskins", () => postJson("get_rapidskins_prices.php", JSON.stringify({
          market_hash_names: quoteMarketNames,
          cache_only: false,
          prefer_live: true
        }), 25e3));
        (async () => {
          let cachedLookup = {};
          try {
            const cachedFloatJson = await postJson("get_csfloat_prices.php", floatBody(floatMarketNames, true), 12e3);
            cachedLookup = normalizeQuoteItemsByHash(cachedFloatJson);
            mergeQuoteLookup("csfloat", cachedLookup);
          } catch {
            mergeQuoteLookup("csfloat", {});
          }
          const missingFloatNames = floatMarketNames.filter((name) => {
            const entry = quoteForMarketHash(cachedLookup, name);
            return !positivePrice(entry?.price);
          });
          if (!missingFloatNames.length) {
            try {
              const indexFloatJson = await postJson(
                "get_csfloat_prices.php",
                JSON.stringify({
                  market_hash_names: floatMarketNames,
                  cache_only: false,
                  prefer_live: false,
                  ignore_auctions: true,
                  require_verified_buy_now: true,
                  listing_fetch_limit: 100
                }),
                18e3
              );
              if (!alive) return;
              mergeQuoteLookup("csfloat", {
                ...cachedLookup,
                ...normalizeQuoteItemsByHash(indexFloatJson)
              });
            } catch {
            }
            return;
          }
          try {
            const liveFloatJson = await postJson(
              "get_csfloat_prices.php",
              floatBody(missingFloatNames.slice(0, 12), false),
              22e3
            );
            if (!alive) return;
            mergeQuoteLookup("csfloat", {
              ...cachedLookup,
              ...normalizeQuoteItemsByHash(liveFloatJson)
            });
          } catch {
          }
        })();
        return () => {
          alive = false;
          controller.abort();
        };
      }, [itemLookupResolved, dynamicQuoteBaseName, HAS_WEAR_VARIANTS, priceRange, SINGLE_ITEM_MARKET_HASH_NAME, skinOriginName, souvenirLookupReady]);
      useEffect(() => {
        if (!itemLookupResolved || !HAS_WEAR_VARIANTS) {
          return void 0;
        }
        const quoteMarketHash = effectiveMarketHashName || SINGLE_ITEM_MARKET_HASH_NAME;
        if (!quoteMarketHash) {
          return void 0;
        }
        const quoteMarketNames = buildDynamicQuoteMarketNames(dynamicQuoteBaseName, quoteMarketHash, HAS_WEAR_VARIANTS, INSPECT_WEAR_OPTIONS, skinOriginName);
        const pendingProviders = ["skinport", "csfloat", "white_market", "dmarket", "market_csgo", "shadowpay", "waxpeer", "mannco", "haloskins", "rapidskins"].filter((providerId) => !wearTableProvidersLoadedRef.current.has(providerId));
        if (!pendingProviders.length) {
          return void 0;
        }
        const floatBody = (names, cacheOnly = true) => JSON.stringify({
          market_hash_names: names,
          cache_only: cacheOnly,
          prefer_live: !cacheOnly,
          ignore_auctions: true,
          require_verified_buy_now: true,
          listing_fetch_limit: 100
        });
        const postJson = (url, body, timeoutMs = 12e3) => fetchJsonWithTimeout(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body
        }, timeoutMs);
        let alive = true;
        const mergeWearLookup = (lookup, providerId) => {
          if (!alive) return;
          const normalizedLookup = lookup && typeof lookup === "object" ? lookup : {};
          setDynamicMarketQuotes((current) => ({
            ...current || {},
            wears: {
              ...current && current.wears || {},
              [providerId]: {
                ...current?.wears?.[providerId] || {},
                ...normalizedLookup
              }
            }
          }));
        };
        const loadWearProvider = async (providerId) => {
          try {
            if (providerId === "white_market") {
              const json = await postJson("get_white_market_prices.php", JSON.stringify({
                market_hash_names: quoteMarketNames,
                cache_only: false,
                prefer_live: true
              }), 25e3);
              mergeWearLookup(normalizeQuoteItemsByHash(json), providerId);
              wearTableProvidersLoadedRef.current.add(providerId);
              return;
            }
            if (providerId === "dmarket") {
              const json = await postJson("get_dmarket_prices.php", JSON.stringify({
                market_hash_names: quoteMarketNames,
                cache_only: false,
                prefer_live: true,
                max_live_requests: quoteMarketNames.length
              }), 3e4);
              mergeWearLookup(normalizeQuoteItemsByHash(json), providerId);
              wearTableProvidersLoadedRef.current.add(providerId);
              return;
            }
            if (providerId === "market_csgo") {
              const json = await postJson("get_market_csgo_prices.php", JSON.stringify({
                market_hash_names: quoteMarketNames,
                cache_only: false,
                prefer_live: true
              }), 3e4);
              mergeWearLookup(normalizeQuoteItemsByHash(json), providerId);
              wearTableProvidersLoadedRef.current.add(providerId);
              return;
            }
            if (providerId === "shadowpay") {
              const json = await postJson("get_shadowpay_prices.php", JSON.stringify({
                market_hash_names: quoteMarketNames,
                cache_only: false,
                prefer_live: true
              }), 3e4);
              mergeWearLookup(normalizeQuoteItemsByHash(json), providerId);
              wearTableProvidersLoadedRef.current.add(providerId);
              return;
            }
            if (providerId === "waxpeer") {
              const json = await postJson("get_waxpeer_prices.php", JSON.stringify({
                market_hash_names: quoteMarketNames,
                cache_only: false,
                prefer_live: true
              }), 3e4);
              mergeWearLookup(normalizeQuoteItemsByHash(json), providerId);
              wearTableProvidersLoadedRef.current.add(providerId);
              return;
            }
            if (providerId === "mannco") {
              const json = await postJson("get_mannco_prices.php", JSON.stringify({
                market_hash_names: quoteMarketNames,
                cache_only: false,
                prefer_live: true
              }), 3e4);
              mergeWearLookup(normalizeQuoteItemsByHash(json), providerId);
              wearTableProvidersLoadedRef.current.add(providerId);
              return;
            }
            if (providerId === "haloskins") {
              const json = await postJson("get_haloskins_prices.php", JSON.stringify({
                market_hash_names: quoteMarketNames,
                cache_only: false,
                prefer_live: true
              }), 3e4);
              mergeWearLookup(normalizeQuoteItemsByHash(json), providerId);
              wearTableProvidersLoadedRef.current.add(providerId);
              return;
            }
            if (providerId === "rapidskins") {
              const json = await postJson("get_rapidskins_prices.php", JSON.stringify({
                market_hash_names: quoteMarketNames,
                cache_only: false,
                prefer_live: true
              }), 3e4);
              mergeWearLookup(normalizeQuoteItemsByHash(json), providerId);
              wearTableProvidersLoadedRef.current.add(providerId);
              return;
            }
            if (providerId === "skinport") {
              const json = await postJson("get_roi_prices_cached.php", JSON.stringify({
                market_hash_names: quoteMarketNames,
                source: "skinport",
                range: "all",
                prefer_live: true,
                allow_live_refresh: true,
                skip_catalog_fallback: true
              }), 25e3);
              mergeWearLookup(normalizeQuoteItemsByHash(json), providerId);
              wearTableProvidersLoadedRef.current.add(providerId);
              return;
            }
            if (providerId === "csfloat") {
              let cachedLookup = {};
              try {
                const cachedFloatJson = await postJson("get_csfloat_prices.php", floatBody(quoteMarketNames, true), 15e3);
                cachedLookup = normalizeQuoteItemsByHash(cachedFloatJson);
                mergeWearLookup(cachedLookup, providerId);
              } catch {
                mergeWearLookup({}, providerId);
              }
              const missingFloatNames = quoteMarketNames.filter((name) => {
                const entry = quoteForMarketHash(cachedLookup, name);
                return !positivePrice(entry?.price);
              });
              if (!missingFloatNames.length) {
                try {
                  const indexFloatJson = await postJson(
                    "get_csfloat_prices.php",
                    JSON.stringify({
                      market_hash_names: quoteMarketNames,
                      cache_only: false,
                      prefer_live: false,
                      ignore_auctions: true,
                      require_verified_buy_now: true,
                      listing_fetch_limit: 100
                    }),
                    18e3
                  );
                  if (!alive) return;
                  mergeWearLookup({
                    ...cachedLookup,
                    ...normalizeQuoteItemsByHash(indexFloatJson)
                  }, providerId);
                } catch {
                }
                wearTableProvidersLoadedRef.current.add(providerId);
                return;
              }
              const liveFloatJson = await postJson(
                "get_csfloat_prices.php",
                floatBody(missingFloatNames.slice(0, 12), false),
                25e3
              );
              if (!alive) return;
              mergeWearLookup({
                ...cachedLookup,
                ...normalizeQuoteItemsByHash(liveFloatJson)
              }, providerId);
              wearTableProvidersLoadedRef.current.add(providerId);
            }
          } catch {
            if (!alive) return;
            wearTableProvidersLoadedRef.current.delete(providerId);
          }
        };
        pendingProviders.forEach((providerId) => {
          loadWearProvider(providerId);
        });
        return () => {
          alive = false;
        };
      }, [itemLookupResolved, HAS_WEAR_VARIANTS, dynamicQuoteBaseName, SINGLE_ITEM_MARKET_HASH_NAME, skinOriginName]);
      useEffect(() => {
        wearTableProvidersLoadedRef.current = /* @__PURE__ */ new Set(["steam"]);
        setDynamicMarketQuotes({});
      }, [dynamicQuoteBaseName, trackedItemId, skinOriginName]);
      useEffect(() => {
        if (USES_EXACT_MARKET_ACTIVITY) {
          const summary = singleMarketActivity?.summary || {};
          const steamPrice = resolveSteamGrossPrice({
            dynamicQuotes: dynamicMarketQuotes,
            singleMarketActivity,
            qualityRows,
            analyticsBundle: effectiveAnalyticsBundle,
            baseName: dynamicQuoteBaseName,
            selectedWear: selectedInspectWear
          });
          const safeSteamReference = steamPrice || positivePrice(dynamicMarketQuotes?.steam?.price) || positivePrice(effectiveAnalyticsBundle?.series?.steam?.current_price) || 0;
          setMarketRowsData(buildMarketplacePriceRows({
            itemName: ITEM_DETAILS.title,
            wear: HAS_WEAR_VARIANTS ? selectedInspectWear : "",
            steamGrossPrice: steamPrice,
            steamMarketUrl: dynamicMarketQuotes?.steam?.market_url || buildSteamMarketUrlFromHash(effectiveMarketHashName) || ITEM_DETAILS.steamLink || buildWearMarketUrl(ITEM_DETAILS.title, selectedInspectWear),
            dynamicQuotes: dynamicMarketQuotes,
            analyticsBundle: effectiveAnalyticsBundle,
            remoteProviders: effectiveRemoteProviders,
            steamReference: safeSteamReference
          }));
          return;
        }
        setMarketRowsData(
          mergeMarketRows(
            steamMarketRowFromQuote(dynamicMarketQuotes?.steam) || steamSnapshot?.steam_market || null,
            skinportSnapshot ? buildSkinportListingsFallback(skinportSnapshot).wears?.[0] ? buildSkinportListingsFallback(skinportSnapshot) : null : null,
            {
              skinport: steamMarketRowFromQuote(dynamicMarketQuotes?.skinport),
              CSFloat: steamMarketRowFromQuote(dynamicMarketQuotes?.csfloat),
              "White.Market": steamMarketRowFromQuote(dynamicMarketQuotes?.white_market),
              DMarket: steamMarketRowFromQuote(dynamicMarketQuotes?.dmarket),
              "Market.CSGO": steamMarketRowFromQuote(dynamicMarketQuotes?.market_csgo),
              ShadowPay: steamMarketRowFromQuote(dynamicMarketQuotes?.shadowpay),
              Waxpeer: steamMarketRowFromQuote(dynamicMarketQuotes?.waxpeer),
              "Mannco.store": steamMarketRowFromQuote(dynamicMarketQuotes?.mannco),
              HaloSkins: steamMarketRowFromQuote(dynamicMarketQuotes?.haloskins),
              RapidSkins: steamMarketRowFromQuote(dynamicMarketQuotes?.rapidskins)
            }
          )
        );
        if (!HAS_WEAR_VARIANTS && skinportSnapshot?.quality_rows?.length) {
          setQualityRows((prev) => applyLiveWearRows(prev, skinportSnapshot.quality_rows));
        }
      }, [steamSnapshot, skinportSnapshot, singleMarketActivity, dynamicMarketQuotes, effectiveRemoteProviders, effectiveAnalyticsBundle, selectedInspectWear, qualityRows, dynamicQuoteBaseName, effectiveMarketHashName]);
      useEffect(() => {
        if (!ANALYTICS_V2_ENABLED) return void 0;
        if (!itemLookupResolved || !trackedItemId && !ITEM_DETAILS.title) return void 0;
        const controller = new AbortController();
        if (!USES_EXACT_MARKET_ACTIVITY) {
          setAnalyticsLoading(true);
        }
        setAnalyticsError("");
        const params = new URLSearchParams({
          lookup_name: ITEM_DETAILS.title,
          wear: HAS_WEAR_VARIANTS ? selectedInspectWear : "",
          range: priceRange,
          source: USES_EXACT_MARKET_ACTIVITY ? "all" : priceSource
        });
        const rangeKey = String(priceRange || "ALL").toUpperCase();
        if (rangeKey === "ALL" || rangeKey === "MAX") {
          const since = resolveReleaseSinceIso(ITEM_DETAILS, marketAddedLabel);
          if (since) params.set("since", since);
        }
        if (trackedItemId) {
          params.set("item_id", String(trackedItemId));
        }
        fetch(`get_market_chart_bundle.php?${params.toString()}`, { signal: controller.signal }).then((response) => {
          if (!response.ok) throw new Error(`Market chart request failed (${response.status})`);
          return response.json();
        }).then((json) => {
          if (controller.signal.aborted) return;
          if (!json?.success) {
            throw new Error(json?.error || "Market chart data is unavailable.");
          }
          setAnalyticsBundle(sanitizeAnalyticsBundle(json, selectedInspectWear, ITEM_DETAILS.title, priceRange));
          if (!USES_EXACT_MARKET_ACTIVITY) {
            setAnalyticsLoading(false);
          }
        }).catch((error) => {
          if (controller.signal.aborted || error?.name === "AbortError") return;
          if (!USES_EXACT_MARKET_ACTIVITY) {
            setAnalyticsBundle(sanitizeAnalyticsBundle(buildAnalyticsBundleFallback(priceSource, selectedInspectWear), selectedInspectWear, ITEM_DETAILS.title, priceRange));
            setAnalyticsLoading(false);
          }
          setAnalyticsError("");
        });
        return () => {
          controller.abort();
        };
      }, [itemLookupResolved, trackedItemId, priceRange, priceSource, selectedInspectWear]);
      useEffect(() => {
        if (ANALYTICS_V2_ENABLED) return void 0;
        if (!itemLookupResolved || !trackedItemId) return void 0;
        const controller = new AbortController();
        const sourceOption = resolvePriceSourceOption(priceSource);
        const params = new URLSearchParams({
          item_id: String(trackedItemId),
          range: priceRange
        });
        if (sourceOption.requestValue) {
          params.set("source", sourceOption.requestValue);
        }
        const requestKey = `${trackedItemId}:${priceRange}:${sourceOption.requestValue || "all"}:${selectedInspectWear}`;
        latestPriceRequestKeyRef.current = requestKey;
        params.set("wear", HAS_WEAR_VARIANTS ? selectedInspectWear : "");
        params.set("lookup_name", ITEM_DETAILS.title);
        fetch(`get_prices.php?${params.toString()}`, { signal: controller.signal }).then((response) => {
          if (!response.ok) throw new Error(`Price history request failed (${response.status})`);
          return response.json();
        }).then((raw) => {
          if (controller.signal.aborted || latestPriceRequestKeyRef.current !== requestKey) return;
          if (raw && raw.error) throw new Error(raw.error);
          const rows = Array.isArray(raw) ? raw : raw.data || [];
          if (!rows.length) throw new Error("No price history data returned");
          setPriceHistory(rows);
        }).catch((error) => {
          if (controller.signal.aborted || latestPriceRequestKeyRef.current !== requestKey) return;
          if (error?.name === "AbortError") return;
          setPriceHistory(buildPriceHistoryFallback(priceSource, selectedInspectWear));
        });
        return () => {
          controller.abort();
        };
      }, [itemLookupResolved, trackedItemId, priceRange, priceSource, selectedInspectWear]);
      useEffect(() => {
        if (ANALYTICS_V2_ENABLED) return void 0;
        distributionRangeRef.current = distributionRange;
        const cached = distributionCacheRef.current[distributionRange];
        if (!cached) {
          return;
        }
        setDistributionTotal(cached.total);
        setDistributionData(cached.data);
      }, [distributionRange]);
      useEffect(() => {
        if (ANALYTICS_V2_ENABLED) return void 0;
        if (!itemLookupResolved || !trackedItemId) return void 0;
        let cancelled = false;
        Promise.all(
          DISTRIBUTION_RANGES.map((range) => fetch(`get_distribution.php?item_id=${trackedItemId}&lookup_name=${encodeURIComponent(ITEM_DETAILS.title)}&range=${range}&_=${Date.now()}`, { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error(`Distribution request failed (${response.status})`);
            return response.json();
          }).then((json) => {
            if (json && json.error) throw new Error(json.error);
            return { range, resolved: resolveDistributionState(range, json) };
          }).catch(() => ({ range, resolved: resolveDistributionState(range, null) })))
        ).then((results) => {
          if (cancelled) return;
          results.forEach(({ range, resolved }) => {
            distributionCacheRef.current[range] = resolved;
          });
          const activeRange = distributionRangeRef.current || "1M";
          const activeRangeState = distributionCacheRef.current[activeRange] || resolveDistributionState(activeRange, null);
          setDistributionTotal(activeRangeState.total);
          setDistributionData(activeRangeState.data);
        });
        return () => {
          cancelled = true;
        };
      }, [itemLookupResolved, trackedItemId]);
      useEffect(() => {
        if (ANALYTICS_V2_ENABLED) return void 0;
        if (!distributionData.length) return;
        if (distributionData.some((entry) => entry.marketplace === selectedMarket)) return;
        setSelectedMarket(distributionData[0].marketplace);
      }, [distributionData, selectedMarket]);
      useEffect(() => {
        if (ANALYTICS_V2_ENABLED) return void 0;
        if (!itemLookupResolved || !trackedItemId) return void 0;
        let cancelled = false;
        fetch(`get_prices.php?item_id=${trackedItemId}&lookup_name=${encodeURIComponent(ITEM_DETAILS.title)}&range=${roiRange}&wear=${encodeURIComponent(selectedInspectWear)}`).then((response) => {
          if (!response.ok) throw new Error(`ROI request failed (${response.status})`);
          return response.json();
        }).then((json) => {
          if (cancelled) return;
          const rows = Array.isArray(json) ? json : [];
          if (!rows.length) throw new Error("No ROI data returned");
          setRoiHistory(rows);
        }).catch(() => {
          if (!cancelled) setRoiHistory(DEMO_PRICE_HISTORY);
        });
        return () => {
          cancelled = true;
        };
      }, [itemLookupResolved, trackedItemId, roiRange, selectedInspectWear]);
      useEffect(() => {
        if (ANALYTICS_V2_ENABLED) return void 0;
        if (!itemLookupResolved || !trackedItemId) return void 0;
        let cancelled = false;
        fetch(`get_provider_prices.php?item_id=${trackedItemId}&lookup_name=${encodeURIComponent(ITEM_DETAILS.title)}&range=${providerRange}&wear=${encodeURIComponent(selectedInspectWear)}`).then((response) => {
          if (!response.ok) throw new Error(`Provider history request failed (${response.status})`);
          return response.json();
        }).then((json) => {
          if (cancelled) return;
          if (json && json.error) throw new Error(json.error);
          const referencePrice = positivePrice(dynamicMarketQuotes?.steam?.price) || 0;
          setRemoteProviders(sanitizeRemoteProviders(json.providers || [], referencePrice, ITEM_DETAILS.title));
        }).catch(() => {
          if (!cancelled) setRemoteProviders(null);
        });
        return () => {
          cancelled = true;
        };
      }, [itemLookupResolved, trackedItemId, providerRange, selectedInspectWear, dynamicMarketQuotes]);
      useEffect(() => {
        let cancelled = false;
        const distLookupName = String(dynamicQuoteBaseName || ITEM_DETAILS.title || "").replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "").trim();
        if (!distLookupName && !trackedItemId) {
          return void 0;
        }
        const distParams = new URLSearchParams({
          lookup_name: distLookupName || ITEM_DETAILS.title,
          range: distRange2
        });
        if (trackedItemId) {
          distParams.set("item_id", String(trackedItemId));
        }
        distParams.set("all_wears", "1");
        distParams.set("_", String(Date.now()));
        fetch(`get_distribution.php?${distParams.toString()}`, { cache: "no-store" }).then((response) => {
          if (!response.ok) throw new Error(`Distribution request failed (${response.status})`);
          return response.json();
        }).then((json) => {
          if (cancelled) return;
          if (json && json.error) throw new Error(json.error);
          const resolved = resolveDistributionState(distRange2, json);
          setDistributionTotal(resolved.total);
          setDistributionData(resolved.data);
          setDistributionUpdatedAt(String(json?.updated_at || ""));
        }).catch(() => {
          if (cancelled) return;
        });
        return () => {
          cancelled = true;
        };
      }, [trackedItemId, distRange2, dynamicQuoteBaseName, ITEM_DETAILS.title]);
      useEffect(() => {
        if (!itemLookupResolved || !trackedItemId && !ITEM_DETAILS.title) return void 0;
        let cancelled = false;
        const providerParams = new URLSearchParams({
          lookup_name: ITEM_DETAILS.title,
          range: provRange2,
          wear: HAS_WEAR_VARIANTS ? selectedInspectWear : "",
          source: "all"
        });
        if (isLifetimeProviderRange(provRange2)) {
          const since = resolveReleaseSinceIso(ITEM_DETAILS, marketAddedLabel);
          if (since) providerParams.set("since", since);
        }
        if (trackedItemId) {
          providerParams.set("item_id", String(trackedItemId));
        }
        fetch(`get_market_chart_bundle.php?${providerParams.toString()}`).then((response) => {
          if (!response.ok) throw new Error(`Provider history request failed (${response.status})`);
          return response.json();
        }).then((json) => {
          if (cancelled) return;
          if (!json?.success) {
            throw new Error(json?.error || "Provider history is unavailable.");
          }
          const providers = providerSeriesFromBundle(json, selectedInspectWear, ITEM_DETAILS.title);
          setRemoteProviders(
            sanitizeRemoteProviders(
              providers,
              providerHistoryReferencePrice(providers),
              ITEM_DETAILS.title
            )
          );
        }).catch(() => {
          if (!cancelled) setRemoteProviders(null);
        });
        return () => {
          cancelled = true;
        };
      }, [itemLookupResolved, trackedItemId, provRange2, selectedInspectWear, ITEM_DETAILS.title]);
      const activeInspectOption = INSPECT_WEAR_OPTIONS.find((option) => option.wear === selectedInspectWear) || INSPECT_WEAR_OPTIONS[0];
      const activeInspectShort = activeInspectOption?.short || "FN";
      const resolvedCatalogImage = String(
        catalogItem?.image || catalogItem?.steam_image_url || ""
      ).trim();
      const resolvedItemImage = (() => {
        const queryImage = String(QUERY_IMAGE || "").trim();
        if (queryImage && !/assets\/markets\/steam\.(png|webp)$/i.test(queryImage)) {
          return queryImage;
        }
        if (resolvedCatalogImage && !/assets\/markets\/steam\.(png|webp)$/i.test(resolvedCatalogImage)) {
          return resolvedCatalogImage;
        }
        if (IS_DEFAULT_TEMPLATE_ITEM) {
          return ITEM_DETAILS.image;
        }
        return queryImage || resolvedCatalogImage || ITEM_DETAILS.image || "assets/markets/steam.png";
      })();
      const resolvedCategoryLabel = isStickerSlabName(SINGLE_ITEM_MARKET_HASH_NAME) || isRegularStickerName(SINGLE_ITEM_MARKET_HASH_NAME) ? t("nav_stickers") : String(catalogItem?.category || PAGE_CATEGORY_LABEL || ITEM_DETAILS.collectionName || "");
      const resolvedTypeLabel = caseCatalogEntry && !looksLikeCapsuleContainer(ITEM_DETAILS.title) ? t("item_type_weaponCase") : isStickerSlabName(SINGLE_ITEM_MARKET_HASH_NAME) ? t("item_type_stickerSlab") : String(catalogItem?.type_note || QUERY_TYPE || ITEM_DETAILS.update || "");
      const displayCollectionName = displayCatalogCategoryLabel(
        resolvedCategoryLabel,
        ITEM_DETAILS.collectionName,
        ITEM_DETAILS.title,
        t
      );
      const displayTypeLabel = resolvedTypeLabel || displayCollectionName;
      const visualType = resolveVisualType(resolvedCategoryLabel, resolvedTypeLabel, QUERY_TYPE_FILTER, ITEM_DETAILS.title);
      const RELATED_FINISHES_WEAPON_CATEGORY = {
        knives: "knives",
        gloves: "gloves",
        pistols: "skins",
        rifles: "skins",
        smgs: "skins",
        shotguns: "skins",
        snipers: "skins",
        heavy: "skins"
      };
      const RELATED_FINISHES_ALL_HREF = {
        knives: "knives.html",
        gloves: "gloves.html",
        pistols: "pistols.html",
        rifles: "rifles.html",
        smgs: "smgs.html",
        shotguns: "shotguns.html",
        snipers: "rifles.html",
        heavy: "heavy.html"
      };
      const relatedFinishesCategory = RELATED_FINISHES_WEAPON_CATEGORY[visualType] || (visualType === "agents" ? "agents" : "");
      const relatedFinishesIsAgent = relatedFinishesCategory === "agents";
      const relatedFinishesCoreName = relatedFinishesCategory && !relatedFinishesIsAgent ? stripItemNamePrefix(ITEM_DETAILS.title).replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, "").trim() : "";
      const relatedFinishesWeapon = relatedFinishesIsAgent ? "CS2 Agents" : relatedFinishesCoreName.split("|")[0]?.trim() || "";
      const relatedFinishesExclude = relatedFinishesIsAgent ? stripItemNamePrefix(ITEM_DETAILS.title).trim() : relatedFinishesCoreName ? (relatedFinishesCategory === "knives" || relatedFinishesCategory === "gloves" ? "★ " : "") + relatedFinishesCoreName : "";
      const relatedFinishesSectionTitle = relatedFinishesIsAgent ? "More from CS2 Agents" : `More ${relatedFinishesWeapon} ${relatedFinishesCategory === "skins" ? "Skins" : "Finishes"}`;
      const relatedFinishesAllHref = relatedFinishesIsAgent ? "agents.html" : RELATED_FINISHES_ALL_HREF[visualType] || "";
      const [relatedFinishes, setRelatedFinishes] = useState([]);
      useEffect(() => {
        if (!relatedFinishesCategory || !relatedFinishesIsAgent && !relatedFinishesWeapon) {
          setRelatedFinishes([]);
          return void 0;
        }
        let cancelled = false;
        const params = new URLSearchParams({
          weapon: relatedFinishesIsAgent ? "" : relatedFinishesWeapon,
          category: relatedFinishesCategory,
          exclude: relatedFinishesExclude,
          limit: "4"
        });
        fetch(`get_related_finishes.php?${params.toString()}`).then((response) => response.json()).then((json) => {
          if (cancelled) return;
          setRelatedFinishes(Array.isArray(json?.items) ? json.items : []);
        }).catch(() => {
          if (!cancelled) setRelatedFinishes([]);
        });
        return () => {
          cancelled = true;
        };
      }, [relatedFinishesWeapon, relatedFinishesCategory, relatedFinishesExclude, relatedFinishesIsAgent]);
      const displaySkinOriginName = resolvePreferredSkinOrigin(skinOriginName, [
        QUERY_BASE_NAME,
        QUERY_DISPLAY_NAME,
        QUERY_MARKET_HASH_NAME,
        QUERY_LOOKUP_NAME,
        SINGLE_ITEM_MARKET_HASH_NAME,
        itemTitle
      ].filter(Boolean));
      const showItemOriginMeta = showsItemOriginMeta(visualType, ITEM_DETAILS.title, isCaseItemView, displaySkinOriginName);
      const displayOriginMetaLabel = originMetaLabel(displaySkinOriginName);
      const headerCollectionLabel = displaySkinOriginName || displayCollectionName;
      const resolvedRarityHex = isCaseItemView ? "34D399" : resolveItemRarityHex(
        QUERY_COLOR || catalogItem?.name_color,
        resolvedTypeLabel || QUERY_TYPE,
        IS_DEFAULT_TEMPLATE_ITEM
      );
      const skinViewerStyle = buildSkinViewerRarityStyle(resolvedRarityHex);
      const activeWeaponImage = IS_DEFAULT_TEMPLATE_ITEM && HAS_WEAR_VARIANTS ? activeInspectOption?.image || ITEM_DETAILS.image : resolvedItemImage;
      const hideXm1014Shell = /xm[\s-]?1014/i.test(String(ITEM_DETAILS.title || QUERY_MARKET_HASH_NAME || QUERY_DISPLAY_NAME || ""));
      const resolvedModelUrl = resolveItemPageModelUrl(ITEM_DETAILS.title, skinModelUrl);
      const canToggle3DViewer = Boolean(resolvedModelUrl) && visualType !== "stickers";
      const supportsInGameInspect = itemSupportsInGameInspect(SINGLE_ITEM_MARKET_HASH_NAME, visualType);
      const canGenerateSkinInspect = Number(craftSkinEcon?.def_index) > 0 && Number(craftSkinEcon?.paint_index) > 0;
      const isContainerWithoutPaint = !HAS_WEAR_VARIANTS && !canGenerateSkinInspect && looksLikeOpenableContainer(ITEM_DETAILS.title, visualType, isCaseItemView);
      const showInspectInGameButton = (HAS_WEAR_VARIANTS || canGenerateSkinInspect || supportsInGameInspect) && !isContainerWithoutPaint;
      const canCustomizeSkin = HAS_WEAR_VARIANTS || canGenerateSkinInspect;
      const inspectLaunchWear = HAS_WEAR_VARIANTS ? selectedInspectWear : "Standard";
      const activeInspectTarget = resolveInspectTarget(inspectLinks, inspectLaunchWear);
      const activeInspectSourceWear = activeInspectTarget.wear;
      const canInspectInGame = canGenerateSkinInspect || Boolean(activeInspectTarget.entry?.inspect_url);
      const hasExactInspectInGame = canGenerateSkinInspect || Boolean((inspectLinks?.[inspectLaunchWear] || inspectLinks?.Standard)?.inspect_url);
      const inspectButtonBusy = (craftEconLoading || inspectLoading) && !canInspectInGame;
      const activeInspectButtonShort = HAS_WEAR_VARIANTS ? wearShortLabel(canGenerateSkinInspect ? inspectLaunchWear : activeInspectSourceWear) : "Game";
      const openInspectTarget = (wear) => {
        const inspectWear = HAS_WEAR_VARIANTS ? wear || selectedInspectWear || DEFAULT_WEAR : wear;
        if (canGenerateSkinInspect) {
          try {
            if (launchGeneratedSkinInspect(craftSkinEcon, inspectWear)) {
              return;
            }
          } catch (_error) {
          }
        }
        const target = resolveInspectTarget(inspectLinks, wear);
        const entry = target.entry;
        const inspectUrl = String(entry?.inspect_url || "").trim();
        if (!inspectUrl) {
          return;
        }
        if (window.CS2InspectLaunch?.launchSteamInspectUrl?.(inspectUrl)) {
          return;
        }
        window.location.assign(inspectUrl);
      };
      const openSteamListing = (wear = selectedInspectWear) => {
        if (!HAS_WEAR_VARIANTS) {
          window.open(ITEM_DETAILS.steamLink || buildSteamMarketUrlFromHash(effectiveMarketHashName), "_blank", "noopener,noreferrer");
          return;
        }
        const entry = inspectLinks[wear] || null;
        const targetUrl = entry?.market_url || buildWearMarketUrl(ITEM_DETAILS.title, wear);
        window.open(targetUrl, "_blank", "noopener,noreferrer");
      };
      const openMarketplaceListing = (wear = selectedInspectWear) => {
        if (effectivePriceSource === "steam") {
          openSteamListing(wear);
          return;
        }
        const targetUrl = sourceMarketplaceUrl(effectivePriceSource, ITEM_DETAILS.title, wear, effectiveAnalyticsBundle);
        window.open(targetUrl, "_blank", "noopener,noreferrer");
      };
      const openProviderListing = (wear, sourceId, marketUrl = "") => {
        if (sourceId === "steam") {
          openSteamListing(wear);
          return;
        }
        const targetUrl = sourceId === "shadowpay" ? buildShadowPayItemUrl(ITEM_DETAILS.title, wear) : sourceId === "skinport" ? normalizeMarketplaceUrl(
          "skinport",
          String(marketUrl || "").trim() || sourceMarketplaceUrl("skinport", ITEM_DETAILS.title, wear, effectiveAnalyticsBundle) || dynamicMarketQuotes?.skinport?.market_url || "",
          ITEM_DETAILS.title,
          wear
        ) : String(marketUrl || "").trim() || sourceMarketplaceUrl(sourceId, ITEM_DETAILS.title, wear, effectiveAnalyticsBundle);
        window.open(targetUrl, "_blank", "noopener,noreferrer");
      };
      const selectWearPreview = (event, wear) => {
        if (!HAS_WEAR_VARIANTS) {
          return;
        }
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        if (isViewerActive) {
          setIsViewerActive(false);
          setViewerStatus("idle");
        }
        setSelectedInspectWear(wear);
      };
      useEffect(() => {
        const container = viewerContainerRef.current;
        const queryModelUrl = resolveQueryOverrideModelUrl(QUERY_MODEL);
        const baseModelUrl = resolveLocalModelUrl(ITEM_DETAILS.title);
        const preferredSkinUrl = queryModelUrl || skinModelUrl || "";
        const localModelUrl = preferredSkinUrl || baseModelUrl;
        const preferBakedModel = Boolean(localModelUrl && !isUnpaintedBaseModelUrl(localModelUrl));
        const isAgentModel = visualType === "agents";
        const isCharmModel = visualType === "charms" || looksLikeCharmInspectModel(localModelUrl, ITEM_DETAILS.title);
        const isKnifeModel = visualType === "knives" || isKnifeItemTitle(ITEM_DETAILS.title) || /\/knife\//i.test(localModelUrl);
        const canFallbackToBaseModel = Boolean(
          preferredSkinUrl && baseModelUrl && preferredSkinUrl !== baseModelUrl
        );
        const preferredAnimationName = String(skinModelMeta?.default_animation || "");
        const configuredPreviewTime = Number(skinModelMeta?.preview_time);
        if (!isViewerActive || !container || visualType === "stickers") return void 0;
        if (!localModelUrl) {
          setViewerStatus("error");
          return void 0;
        }
        let cancelled = false;
        if (!window.THREE || !window.THREE.GLTFLoader || !window.THREE.OrbitControls) {
          setViewerStatus("error");
          return void 0;
        }
        const existingResources = viewerResourcesRef.current;
        const startRenderLoop = (resources2) => {
          resources2.isActive = true;
          resources2.lastFrameTime = window.performance.now();
          const renderFrame = () => {
            if (!viewerResourcesRef.current || !viewerResourcesRef.current.isActive) return;
            const now = window.performance.now();
            const delta = Math.min(0.05, Math.max(0, (now - (resources2.lastFrameTime || now)) / 1e3));
            resources2.lastFrameTime = now;
            if (resources2.floatEnabled && resources2.modelRoot && resources2.floatBasePosition && !resources2.floatPaused) {
              resources2.floatElapsed = (resources2.floatElapsed || 0) + delta;
              const t2 = resources2.floatElapsed;
              const bob = Math.sin(t2 * 1.65 + (resources2.floatPhase || 0)) * (resources2.floatAmplitude || 0);
              resources2.modelRoot.position.y = resources2.floatBasePosition.y + bob;
              if (resources2.orbitFocus) {
                resources2.controls.target.set(
                  resources2.orbitFocus.x,
                  resources2.orbitFocus.y + bob,
                  resources2.orbitFocus.z
                );
              }
            }
            if (resources2.mixer) {
              resources2.mixer.update(delta);
            }
            resources2.controls.update();
            resources2.renderer.render(resources2.scene, resources2.camera);
            resources2.frameId = window.requestAnimationFrame(renderFrame);
          };
          if (resources2.frameId) {
            window.cancelAnimationFrame(resources2.frameId);
          }
          renderFrame();
        };
        const stopRenderLoop = (resources2) => {
          if (!resources2) return;
          resources2.isActive = false;
          if (resources2.frameId) {
            window.cancelAnimationFrame(resources2.frameId);
            resources2.frameId = null;
          }
        };
        const destroyViewerResources = (resources2, disposeModel) => {
          if (!resources2) return;
          stopRenderLoop(resources2);
          resources2.resizeObserver?.disconnect();
          if (resources2.resizeHandler) {
            window.removeEventListener("resize", resources2.resizeHandler);
          }
          if (disposeModel && resources2.modelRoot) {
            resources2.animationAction?.stop?.();
            resources2.mixer?.stopAllAction?.();
            resources2.mixer?.uncacheRoot?.(resources2.modelRoot);
            resources2.modelRoot.traverse((child) => {
              if (child.geometry && typeof child.geometry.dispose === "function") {
                child.geometry.dispose();
              }
              if (child.material) {
                disposeViewerMaterials(child.material);
              }
            });
          }
          if (resources2.controls) {
            if (resources2.controlStartHandler) {
              resources2.controls.removeEventListener("start", resources2.controlStartHandler);
            }
            if (resources2.controlEndHandler) {
              resources2.controls.removeEventListener("end", resources2.controlEndHandler);
            }
            resources2.controls.dispose?.();
          }
          resources2.renderer?.dispose?.();
          const host = resources2.renderer?.domElement?.parentNode;
          if (host) {
            host.removeChild(resources2.renderer.domElement);
          }
          if (viewerResourcesRef.current === resources2) {
            viewerResourcesRef.current = null;
          }
        };
        if (existingResources) {
          if (existingResources.modelUrl && existingResources.modelUrl !== localModelUrl) {
            destroyViewerResources(existingResources, true);
          } else {
            existingResources.container = container;
            if (existingResources.renderer.domElement.parentNode !== container) {
              container.appendChild(existingResources.renderer.domElement);
            }
            existingResources.resizeHandler?.();
            setViewerStatus("ready");
            startRenderLoop(existingResources);
            return () => {
              stopRenderLoop(existingResources);
            };
          }
        }
        setViewerStatus("loading");
        const scene = new window.THREE.Scene();
        const camera = new window.THREE.PerspectiveCamera(VIEWER_CAMERA_FOV, 1, 0.1, 100);
        const renderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputEncoding = window.THREE.sRGBEncoding;
        renderer.toneMapping = window.THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.6;
        container.appendChild(renderer.domElement);
        const ambientLight = new window.THREE.AmbientLight(16777215, 0.46);
        const keyLight = new window.THREE.DirectionalLight(16773855, 0.84);
        const rimLight = new window.THREE.DirectionalLight(9677055, 0.28);
        const fillLight = new window.THREE.HemisphereLight(14411515, 329750, 0.18);
        keyLight.position.set(5.2, 3.1, 4.8);
        rimLight.position.set(-4.6, 1.35, -5.4);
        scene.add(ambientLight, keyLight, rimLight, fillLight);
        const controls = new window.THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.zoomSpeed = 1.12;
        controls.minPolarAngle = isCharmModel ? Math.PI * 0.12 : isAgentModel ? Math.PI * 0.18 : isKnifeModel ? Math.PI * 0.24 : Math.PI * 0.3;
        controls.maxPolarAngle = isCharmModel ? Math.PI * 0.88 : isAgentModel ? Math.PI * 0.82 : isKnifeModel ? Math.PI * 0.76 : Math.PI * 0.7;
        const resources = {
          animationAction: null,
          camera,
          container,
          controlEndHandler: null,
          controlStartHandler: null,
          controls,
          floatAmplitude: 0,
          floatBasePosition: null,
          floatElapsed: 0,
          floatEnabled: !isAgentModel,
          floatPaused: false,
          floatPhase: Math.random() * Math.PI * 2,
          orbitFocus: null,
          frameId: null,
          isActive: false,
          lastFrameTime: 0,
          mixer: null,
          modelUrl: localModelUrl,
          modelRoot: null,
          renderer,
          resizeHandler: null,
          resizeObserver: null,
          scene
        };
        resources.controlStartHandler = () => {
          resources.floatPaused = true;
        };
        resources.controlEndHandler = () => {
          resources.floatPaused = false;
        };
        controls.addEventListener("start", resources.controlStartHandler);
        controls.addEventListener("end", resources.controlEndHandler);
        const resizeViewer = () => {
          const width = container.clientWidth;
          const height = container.clientHeight;
          if (!width || !height) return;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        const releaseViewerResources = (disposeModel) => {
          destroyViewerResources(resources, disposeModel);
        };
        resources.resizeHandler = resizeViewer;
        window.addEventListener("resize", resizeViewer);
        if (typeof window.ResizeObserver === "function") {
          resources.resizeObserver = new window.ResizeObserver(resizeViewer);
          resources.resizeObserver.observe(container);
        }
        const originalCreateImageBitmap = window.createImageBitmap;
        const shouldRestoreImageBitmap = /\.glb$/i.test(localModelUrl) && typeof originalCreateImageBitmap === "function";
        const restoreImageBitmap = () => {
          if (!shouldRestoreImageBitmap) return;
          try {
            window.createImageBitmap = originalCreateImageBitmap;
          } catch (_error) {
            return;
          }
        };
        if (shouldRestoreImageBitmap) {
          try {
            window.createImageBitmap = void 0;
          } catch (_error) {
            restoreImageBitmap();
          }
        }
        const loader = new window.THREE.GLTFLoader();
        const finalizeLoadedModel = (gltf, activeModelUrl) => {
          restoreImageBitmap();
          if (cancelled) {
            resources.modelRoot = gltf.scene;
            releaseViewerResources(true);
            return;
          }
          const modelRoot = gltf.scene;
          resources.modelRoot = modelRoot;
          resources.modelUrl = activeModelUrl;
          modelRoot.traverse((child) => {
            if (child?.name && /legacy/i.test(child.name) && !/body_legacy/i.test(child.name)) {
              child.visible = false;
            }
            if (isAgentModel && child?.name && /(firstperson|defusekit)/i.test(child.name)) {
              child.visible = false;
            }
            if (child?.isMesh) {
              if (preferBakedModel && child.material) {
                const enhance = window.CS2SkinViewer?.enhanceViewerMaterials;
                if (typeof enhance === "function") {
                  enhance(child.material, window.THREE, { preferBakedModel: true });
                }
              }
              prepareGlockLegacyPaintMesh(child, window.THREE);
            }
          });
          const hideShotgunShells = window.CS2SkinViewer?.hideShotgunShellMeshes || window.CS2SkinViewer?.hideXm1014ShellMeshes;
          if (typeof hideShotgunShells === "function") {
            hideShotgunShells(modelRoot, window.THREE, {
              itemTitle: ITEM_DETAILS.title,
              modelUrl: activeModelUrl,
              source: "item-page"
            });
          }
          if (!isCharmModel) {
            modelRoot.rotation.set(0, Math.PI, 0);
          }
          modelRoot.updateMatrixWorld(true);
          normalizeViewerModelScale(modelRoot, window.THREE, { isAgentModel });
          const previewClip = pickPreviewAnimation(gltf.animations, preferredAnimationName);
          if (previewClip) {
            const mixer = new window.THREE.AnimationMixer(modelRoot);
            const action = mixer.clipAction(previewClip);
            action.enabled = true;
            action.reset();
            action.setLoop(window.THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.play();
            const previewTime = resolvePreviewPoseTime(previewClip, configuredPreviewTime);
            if (previewTime > 0) {
              mixer.update(previewTime);
              action.paused = true;
            }
            resources.mixer = mixer;
            resources.animationAction = action;
          }
          if (isCharmModel) {
            applyCharmInspectPresentation(modelRoot, window.THREE, {
              modelUrl: activeModelUrl,
              title: ITEM_DETAILS.title
            });
          } else if (!isAgentModel && !isKnifeModel) {
            normalizeGunPresentation(modelRoot, window.THREE, {
              itemTitle: ITEM_DETAILS.title,
              modelUrl: activeModelUrl
            });
            applyWeaponInspectPose(modelRoot, window.THREE, {
              itemTitle: ITEM_DETAILS.title,
              modelUrl: activeModelUrl
            });
          }
          modelRoot.updateMatrixWorld(true);
          if (!isAgentModel && !isKnifeModel && !isCharmModel) {
            centerGunModelInView(modelRoot, window.THREE, { isAgentModel });
          } else {
            const initialBounds = computeViewerBounds(modelRoot, window.THREE, { isAgentModel });
            const rotatedCenter = initialBounds.getCenter(new window.THREE.Vector3());
            modelRoot.position.sub(rotatedCenter);
            modelRoot.updateMatrixWorld(true);
          }
          const bounds = computeViewerBounds(modelRoot, window.THREE, { isAgentModel });
          const center = bounds.getCenter(new window.THREE.Vector3());
          const size = bounds.getSize(new window.THREE.Vector3());
          if (!isAgentModel && !isKnifeModel && !isCharmModel) {
            center.set(
              Math.abs(center.x) < size.x * 0.02 ? 0 : center.x,
              Math.abs(center.y) < size.y * 0.02 ? 0 : center.y,
              Math.abs(center.z) < size.z * 0.02 ? 0 : center.z
            );
          }
          const viewerAspect = Math.max(container.clientWidth / Math.max(container.clientHeight, 1), 1);
          const useStandardGunCamera = !isAgentModel && !isKnifeModel && !isCharmModel;
          let focusX;
          let focusY;
          let focusZ;
          let cameraDistance;
          let maxDimension;
          if (isCharmModel) {
            const cameraPlacement = resolveCharmInspectCameraPlacement(center, size, window.THREE, {
              viewerAspect,
              cameraFov: camera.fov
            }) || resolveStandardGunCameraPlacement(center, size, window.THREE, {
              viewerAspect,
              cameraFov: camera.fov
            });
            focusX = cameraPlacement.focus.x;
            focusY = cameraPlacement.focus.y;
            focusZ = cameraPlacement.focus.z;
            cameraDistance = cameraPlacement.cameraDistance;
            maxDimension = cameraPlacement.maxDimension || 1;
            scene.add(modelRoot);
            camera.near = Math.max(1e-3, maxDimension * 0.02);
            camera.far = Math.max(30, maxDimension * 18);
            camera.position.copy(cameraPlacement.position);
            camera.lookAt(cameraPlacement.focus);
            camera.updateProjectionMatrix();
            controls.target.copy(cameraPlacement.focus);
          } else if (useStandardGunCamera) {
            const cameraPlacement = resolveStandardGunCameraPlacement(center, size, window.THREE, {
              viewerAspect,
              cameraFov: camera.fov
            });
            focusX = cameraPlacement.focus.x;
            focusY = cameraPlacement.focus.y;
            focusZ = cameraPlacement.focus.z;
            cameraDistance = cameraPlacement.cameraDistance;
            maxDimension = cameraPlacement.maxDimension || 1;
            scene.add(modelRoot);
            camera.near = Math.max(1e-3, maxDimension * 0.03);
            camera.far = Math.max(30, maxDimension * 16);
            camera.position.copy(cameraPlacement.position);
            camera.lookAt(cameraPlacement.focus);
            camera.updateProjectionMatrix();
            controls.target.copy(cameraPlacement.focus);
          } else {
            maxDimension = Math.max(size.x, size.y, size.z) || 1;
            const verticalFov = window.THREE.MathUtils.degToRad(camera.fov);
            const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * viewerAspect);
            const fitHeightDistance = size.y * 0.5 / Math.tan(verticalFov / 2);
            const fitWidthDistance = size.x * 0.5 / Math.tan(horizontalFov / 2);
            cameraDistance = isAgentModel ? Math.max(fitHeightDistance * 1.04, fitWidthDistance * 1.12) + size.z * 0.26 : Math.max(fitHeightDistance, fitWidthDistance) * 1.06 + size.z * 0.24;
            focusX = center.x;
            focusY = center.y + size.y * (isAgentModel ? 0.14 : 0.04);
            focusZ = center.z;
            scene.add(modelRoot);
            camera.near = Math.max(1e-3, maxDimension * (isAgentModel ? 0.015 : 0.03));
            camera.far = Math.max(30, maxDimension * (isAgentModel ? 24 : 16));
            camera.position.set(
              focusX,
              focusY + size.y * (isAgentModel ? 0.05 : 0.028),
              center.z + cameraDistance
            );
            camera.lookAt(focusX, focusY, center.z);
            camera.updateProjectionMatrix();
            controls.target.set(focusX, focusY, center.z);
          }
          controls.minDistance = Math.max(cameraDistance * (isAgentModel ? 0.58 : 0.72), maxDimension * (isAgentModel ? 0.54 : 0.62));
          controls.maxDistance = Math.max(cameraDistance * (isAgentModel ? 2.2 : 1.9), maxDimension * (isAgentModel ? 3.2 : 2.7));
          controls.update();
          resources.floatAmplitude = isKnifeModel ? Math.max(maxDimension * 0.028, 8e-3) : Math.max(maxDimension * 0.016, 4e-3);
          resources.floatBasePosition = modelRoot.position.clone();
          resources.orbitFocus = { x: focusX, y: focusY, z: focusZ };
          resources.floatElapsed = 0;
          resizeViewer();
          viewerResourcesRef.current = resources;
          setViewerStatus("ready");
          startRenderLoop(resources);
        };
        const loadViewerModel = (modelUrl, allowFallback) => {
          loader.load(
            modelUrl,
            (gltf) => finalizeLoadedModel(gltf, modelUrl),
            void 0,
            () => {
              if (!cancelled && allowFallback && baseModelUrl && modelUrl !== baseModelUrl) {
                loadViewerModel(baseModelUrl, false);
                return;
              }
              restoreImageBitmap();
              releaseViewerResources(true);
              if (!cancelled) {
                setViewerStatus("error");
              }
            }
          );
        };
        loadViewerModel(localModelUrl, canFallbackToBaseModel);
        return () => {
          cancelled = true;
          restoreImageBitmap();
          if (!viewerResourcesRef.current) {
            releaseViewerResources(false);
            return;
          }
          stopRenderLoop(resources);
        };
      }, [isViewerActive, resolvedModelUrl, skinModelUrl, ITEM_DETAILS.title, skinModelMeta?.default_animation, skinModelMeta?.preview_time, visualType]);
      useEffect(() => {
        const syncCharts = () => {
          const instances = ANALYTICS_V2_ENABLED ? [
            analyticsHistoryChartRef.current,
            sourceCompareChartRef.current,
            activityChartRef.current
          ] : [
            priceChartInstanceRef.current,
            donutChartInstanceRef.current,
            listingsChartInstanceRef.current,
            roiChartInstanceRef.current,
            providerChartInstanceRef.current
          ];
          instances.forEach((instance) => {
            if (!instance) return;
            if (typeof instance.resize === "function") {
              instance.resize();
            }
            if (typeof instance.update === "function") {
              instance.update("none");
            }
          });
          if (provInst2.current?.resize) {
            provInst2.current.resize();
            provInst2.current.update("none");
          }
          if (fullscreenTarget) {
            scheduleLightweightChartResize("fullscreen");
          } else {
            scheduleLightweightChartResize();
          }
        };
        const frameId = window.requestAnimationFrame(syncCharts);
        const timeoutId = window.setTimeout(syncCharts, 0);
        return () => {
          window.cancelAnimationFrame(frameId);
          window.clearTimeout(timeoutId);
        };
      }, [fullscreenTarget]);
      useLayoutEffect(() => {
        if (isMainChartFullscreen) return void 0;
        const parked = document.querySelector("body > .tv-chart-panel");
        if (parked) clearFullscreenInline(parked);
        setChartFsClass(false);
        return void 0;
      }, [isMainChartFullscreen]);
      useLayoutEffect(() => {
        if (!isMainChartFullscreen) return void 0;
        const panel = fullscreenRefs.current["main-chart"] || document.querySelector("body > .tv-chart-panel") || document.querySelector(".tv-chart-panel");
        if (!panel) return void 0;
        parkChartPanelOnBody(panel);
        applyFullscreenInline(panel);
        return void 0;
      });
      useLayoutEffect(() => {
        if (!isMainChartFullscreen) return void 0;
        const panel = fullscreenRefs.current["main-chart"] || document.querySelector("body > .tv-chart-panel") || document.querySelector(".tv-chart-panel");
        if (panel) {
          parkChartPanelOnBody(panel);
          applyFullscreenInline(panel);
        }
        scheduleLightweightChartResize("fullscreen");
        const frameId = window.requestAnimationFrame(() => {
          if (fullscreenTargetRef.current !== "main-chart") return;
          const live = fullscreenRefs.current["main-chart"] || document.querySelector("body > .tv-chart-panel");
          if (live) {
            parkChartPanelOnBody(live);
            applyFullscreenInline(live);
          }
          scheduleLightweightChartResize("fullscreen");
        });
        return () => window.cancelAnimationFrame(frameId);
      }, [isMainChartFullscreen, analyticsLoading, priceRange, effectivePriceSource, effectiveAnalyticsBundle]);
      useEffect(() => {
        if (!ANALYTICS_V2_ENABLED) return void 0;
        if (analyticsHistoryChartRef.current) {
          analyticsHistoryChartRef.current.destroy();
          analyticsHistoryChartRef.current = null;
        }
        const canvas = analyticsHistoryCanvasRef.current;
        const series = resolveAnalyticsSeries(effectiveAnalyticsBundle, effectivePriceSource);
        const rawPoints = normalizeAnalyticsSeriesPoints(series?.points || []);
        const referencePrice = Number(series?.current_price || rawPoints[rawPoints.length - 1]?.price || 0);
        const chartMarketplace = ["skinport", "csfloat", "white_market", "dmarket", "market_csgo", "shadowpay", "waxpeer", "mannco", "haloskins", "rapidskins"].includes(effectivePriceSource);
        const prepared = prepareChartDisplaySeries(rawPoints, referencePrice, chartMarketplace);
        const points = prepared.points;
        const priceBounds = prepared.priceBounds;
        if (!canvas || !window.Chart || !points.length) return void 0;
        ensureAnalyticsChartPlugins();
        const context = canvas.getContext("2d");
        if (!context) return void 0;
        const includeTime = hasIntradaySnapshots(points);
        const labels = points.map((point) => formatHistoryAxisLabel(point.date, includeTime));
        const prices = points.map((point) => Number(point.price || 0));
        const volumes = points.map((point) => Number(point.volume || 0));
        const theme = ANALYTICS_SOURCE_THEME[effectivePriceSource] || ANALYTICS_SOURCE_THEME.steam;
        const maxVolume = Math.max(1, ...volumes);
        const chartH = canvas.offsetHeight || 380;
        const volStripH = Math.round(chartH * 0.16);
        const priceAreaH = chartH - volStripH;
        const gradient = context.createLinearGradient(0, 0, 0, priceAreaH);
        gradient.addColorStop(0, theme.fillTop);
        gradient.addColorStop(0.6, theme.fillBottom);
        gradient.addColorStop(1, "rgba(9, 14, 26, 0)");
        const volBarColor = "rgba(74, 144, 226, 0.52)";
        const volumeColors = points.map(() => volBarColor);
        const pricempireLatestPlugin = {
          id: "pricempireLatest",
          afterDatasetsDraw(chart) {
            const lineIdx = chart.data.datasets.findIndex((d) => d.type === "line");
            if (lineIdx === -1) return;
            const meta = chart.getDatasetMeta(lineIdx);
            const lastPoint = meta.data[meta.data.length - 1];
            const lastValue = chart.data.datasets[lineIdx].data[chart.data.datasets[lineIdx].data.length - 1];
            if (!lastPoint || !Number.isFinite(Number(lastValue))) return;
            const ctx2 = chart.ctx;
            const area = chart.chartArea;
            const y = lastPoint.y;
            const label = formatPrice(lastValue);
            ctx2.save();
            ctx2.setLineDash([4, 5]);
            ctx2.strokeStyle = "rgba(96, 165, 250, 0.38)";
            ctx2.lineWidth = 1;
            ctx2.beginPath();
            ctx2.moveTo(area.left, y);
            ctx2.lineTo(area.right, y);
            ctx2.stroke();
            ctx2.setLineDash([]);
            ctx2.font = "700 11px Inter, sans-serif";
            const tw = ctx2.measureText(label).width;
            const pw = tw + 16;
            const ph = 22;
            const px = Math.max(area.left + 6, area.right - pw - 6);
            const py = Math.max(area.top + 2, Math.min(area.bottom - ph - 2, y - ph / 2));
            ctx2.fillStyle = theme.line;
            ctx2.beginPath();
            ctx2.roundRect(px, py, pw, ph, 5);
            ctx2.fill();
            ctx2.fillStyle = "#fff";
            ctx2.textBaseline = "middle";
            ctx2.textAlign = "left";
            ctx2.fillText(label, px + 8, py + ph / 2);
            ctx2.restore();
          }
        };
        analyticsHistoryChartRef.current = new window.Chart(context, {
          data: {
            labels,
            datasets: [
              {
                type: "bar",
                label: "Volume",
                data: volumes,
                backgroundColor: volumeColors,
                borderRadius: 1,
                borderSkipped: false,
                barPercentage: includeTime ? 0.99 : 0.92,
                categoryPercentage: 1,
                maxBarThickness: includeTime ? 3 : 12,
                yAxisID: "y1",
                order: 1
              },
              {
                type: "line",
                label: `${series?.label || "Market"} price`,
                data: prices,
                borderColor: theme.line,
                backgroundColor: gradient,
                fill: true,
                tension: 0.35,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHitRadius: 14,
                borderWidth: 2,
                yAxisID: "y",
                order: 2,
                clip: false
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 820, easing: "easeOutQuart" },
            interaction: { mode: "index", intersect: false },
            layout: { padding: { top: 16, right: 14, bottom: 4, left: 4 } },
            plugins: {
              legend: { display: false },
              zoom: window.ChartZoom ? {
                pan: { enabled: true, mode: "x", modifierKey: "shift" },
                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" }
              } : void 0,
              tooltip: {
                backgroundColor: "rgba(12, 18, 32, 0.96)",
                borderColor: "rgba(88, 123, 190, 0.3)",
                borderWidth: 1,
                padding: 12,
                titleColor: "#c9d8ef",
                bodyColor: "#f1f5f9",
                displayColors: false,
                titleFont: { size: 11, weight: "600", family: "Inter, sans-serif" },
                bodyFont: { size: 12, weight: "700", family: "Inter, sans-serif" },
                callbacks: {
                  title: (items) => formatHistoryTooltipLabel(points[items[0].dataIndex]?.date),
                  label: (contextItem) => contextItem.dataset.type === "line" ? `${series?.label || "Market"}: ${formatPrice(contextItem.raw)}` : `Volume: ${formatCount(contextItem.raw)}`
                }
              }
            },
            scales: {
              x: {
                grid: { display: false, drawBorder: false },
                border: { display: false },
                ticks: {
                  color: "rgba(130, 155, 190, 0.85)",
                  font: { size: 10, weight: "600", family: "Inter, sans-serif" },
                  autoSkip: true,
                  maxRotation: 0,
                  maxTicksLimit: includeTime ? 12 : 8
                }
              },
              y: {
                position: "left",
                min: priceBounds.min,
                max: priceBounds.max,
                grace: "8%",
                grid: {
                  color: "rgba(75, 95, 125, 0.18)",
                  drawBorder: false,
                  lineWidth: 0.8
                },
                border: { display: false },
                title: {
                  display: true,
                  text: "Price",
                  color: theme.line,
                  font: { size: 11, weight: "700", family: "Inter, sans-serif" }
                },
                ticks: {
                  color: theme.line,
                  font: { size: 10, weight: "600", family: "Inter, sans-serif" },
                  padding: 8,
                  maxTicksLimit: 7,
                  callback: (value) => formatPrice(value)
                }
              },
              y1: {
                position: "right",
                beginAtZero: true,
                suggestedMax: maxVolume * 1.1,
                grid: { display: false, drawBorder: false },
                border: { display: false },
                title: {
                  display: true,
                  text: "Volume",
                  color: "#4a90e2",
                  font: { size: 11, weight: "700", family: "Inter, sans-serif" }
                },
                ticks: {
                  display: true,
                  color: "#4a90e2",
                  font: { size: 10, weight: "600", family: "Inter, sans-serif" },
                  padding: 8,
                  maxTicksLimit: 5,
                  callback: (value) => formatCount(value)
                }
              }
            }
          },
          plugins: [pricempireLatestPlugin]
        });
        return () => {
          if (analyticsHistoryChartRef.current) {
            analyticsHistoryChartRef.current.destroy();
            analyticsHistoryChartRef.current = null;
          }
        };
      }, [effectiveAnalyticsBundle, effectivePriceSource, selectedInspectWear, priceRange]);
      useEffect(() => {
        if (!ANALYTICS_V2_ENABLED) return void 0;
        if (sourceCompareChartRef.current) {
          sourceCompareChartRef.current.destroy();
          sourceCompareChartRef.current = null;
        }
        const canvas = sourceCompareCanvasRef.current;
        const cards = (effectiveAnalyticsBundle?.snapshot_cards || []).filter((card) => card.id !== "all" && Number.isFinite(Number(card.price)));
        if (!canvas || !window.Chart || !cards.length) return void 0;
        ensureAnalyticsChartPlugins();
        const context = canvas.getContext("2d");
        if (!context) return void 0;
        sourceCompareChartRef.current = new window.Chart(context, {
          type: "bar",
          data: {
            labels: cards.map((card) => card.label),
            datasets: [{
              label: "Current price",
              data: cards.map((card) => Number(card.price || 0)),
              backgroundColor: cards.map((card) => ANALYTICS_SOURCE_THEME[card.id]?.line || "#4f8dff"),
              borderRadius: 16,
              borderSkipped: false,
              barPercentage: 0.68,
              categoryPercentage: 0.7
            }]
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 740, easing: "easeOutQuart" },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: "rgba(16, 24, 39, 0.98)",
                borderColor: "rgba(88, 123, 190, 0.36)",
                borderWidth: 1,
                displayColors: false,
                callbacks: {
                  title: (items) => items[0].label,
                  label: (contextItem) => `${formatPrice(contextItem.raw)} â€˘ ${formatUpdatedAt(cards[contextItem.dataIndex]?.updated_at)}`
                }
              }
            },
            scales: {
              x: {
                grid: {
                  color: "rgba(85, 101, 125, 0.24)",
                  drawBorder: false
                },
                border: { display: false },
                ticks: {
                  color: "rgba(160, 178, 206, 0.82)",
                  font: { size: 11, weight: "700" },
                  callback: (value) => formatPrice(value)
                }
              },
              y: {
                grid: { display: false, drawBorder: false },
                border: { display: false },
                ticks: {
                  color: "#e2e8f0",
                  font: { size: 12, weight: "700" }
                }
              }
            }
          }
        });
        return () => {
          if (sourceCompareChartRef.current) {
            sourceCompareChartRef.current.destroy();
            sourceCompareChartRef.current = null;
          }
        };
      }, [effectiveAnalyticsBundle, selectedInspectWear]);
      useEffect(() => {
        if (!ANALYTICS_V2_ENABLED) return void 0;
        if (activityChartRef.current) {
          activityChartRef.current.destroy();
          activityChartRef.current = null;
        }
        const canvas = activityCanvasRef.current;
        const series = resolveAnalyticsSeries(effectiveAnalyticsBundle, effectivePriceSource);
        const points = normalizeAnalyticsSeriesPoints(series?.points || []);
        if (!canvas || !window.Chart || !points.length) return void 0;
        ensureAnalyticsChartPlugins();
        const context = canvas.getContext("2d");
        if (!context) return void 0;
        const includeTime = hasIntradaySnapshots(points);
        const labels = points.map((point) => formatHistoryAxisLabel(point.date, includeTime));
        const volumes = points.map((point) => Number(point.volume || 0));
        const averages = buildVolumeMovingAverage(points, points.length > 90 ? 16 : 8);
        const lineColor = effectivePriceSource === "skinport" ? "#fbbf24" : "#8ab4ff";
        activityChartRef.current = new window.Chart(context, {
          data: {
            labels,
            datasets: [
              {
                type: "bar",
                label: "Market activity",
                data: volumes,
                backgroundColor: buildMainChartVolumeColors(points, effectivePriceSource).map((color) => color.replace(/0\.\d+\)/, "0.5)")),
                borderRadius: 0,
                borderSkipped: false,
                barPercentage: includeTime ? 0.98 : 0.86,
                categoryPercentage: 1,
                maxBarThickness: includeTime ? 4 : 14
              },
              {
                type: "line",
                label: "Smoothed activity",
                data: averages,
                borderColor: lineColor,
                backgroundColor: lineColor,
                tension: 0.18,
                pointRadius: 0,
                pointHoverRadius: 3,
                borderWidth: 2
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 760, easing: "easeOutQuart" },
            interaction: { mode: "index", intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: "rgba(16, 24, 39, 0.98)",
                borderColor: "rgba(88, 123, 190, 0.36)",
                borderWidth: 1,
                displayColors: false,
                callbacks: {
                  title: (items) => formatHistoryTooltipLabel(points[items[0].dataIndex]?.date),
                  label: (contextItem) => contextItem.dataset.type === "line" ? `Smoothed volume: ${formatCount(contextItem.raw)}` : `Volume: ${formatCount(contextItem.raw)}`
                }
              }
            },
            scales: {
              x: {
                grid: { display: false, drawBorder: false },
                border: { display: false },
                ticks: {
                  color: "rgba(140, 162, 196, 0.84)",
                  font: { size: 10, weight: "700" },
                  autoSkip: true,
                  maxRotation: 0,
                  maxTicksLimit: includeTime ? 10 : 7
                }
              },
              y: {
                beginAtZero: true,
                grid: {
                  color: "rgba(85, 101, 125, 0.24)",
                  drawBorder: false
                },
                border: { display: false },
                ticks: {
                  color: "rgba(160, 178, 206, 0.82)",
                  font: { size: 11, weight: "700" },
                  callback: (value) => formatCount(value)
                }
              }
            }
          }
        });
        return () => {
          if (activityChartRef.current) {
            activityChartRef.current.destroy();
            activityChartRef.current = null;
          }
        };
      }, [effectiveAnalyticsBundle, effectivePriceSource, selectedInspectWear, priceRange]);
      useEffect(() => {
        const canvas = donutRef2.current;
        if (!canvas || !window.Chart) return void 0;
        if (donutInst2.current) {
          donutInst2.current.destroy();
          donutInst2.current = null;
        }
        let cancelled = false;
        const chartRows = buildDistributionChartRows(
          distributionData,
          dynamicMarketQuotes,
          effectiveAnalyticsBundle,
          dynamicQuoteBaseName || ITEM_DETAILS.title,
          selectedInspectWear,
          HAS_WEAR_VARIANTS
        );
        if (!chartRows.length) return void 0;
        const wrap = canvas.closest(".tv-dist-hbar-wrap");
        if (wrap) {
          const rowHeight = 36;
          const chartHeight = Math.max(280, Math.min(720, chartRows.length * rowHeight + 56));
          wrap.style.height = chartHeight + "px";
          wrap.style.minHeight = chartHeight + "px";
          wrap.style.maxHeight = "none";
        }
        const barColors = chartRows.map((row) => marketColor(row.label));
        const hoverColors = barColors.map((color) => {
          if (String(color).startsWith("#") && color.length === 7) {
            return color + "cc";
          }
          return color;
        });
        const maxBarValue = Math.max(1, ...chartRows.map((row) => Number(row.value) || 0));
        const xAxisMax = Math.max(maxBarValue * 1.06, maxBarValue + 1);
        const iconMap = {};
        const loadMarketplaceIcon = (label) => new Promise((resolve) => {
          const src = marketplaceTableImage(label);
          if (!src) {
            resolve({ label, img: null });
            return;
          }
          const img = new Image();
          let settled = false;
          const finish = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
          };
          const timer = window.setTimeout(() => finish({ label, img: null }), 1800);
          img.onload = () => {
            window.clearTimeout(timer);
            finish({ label, img });
          };
          img.onerror = () => {
            window.clearTimeout(timer);
            finish({ label, img: null });
          };
          img.src = src;
        });
        const ctx = canvas.getContext("2d");
        if (!ctx) return void 0;
        const labelBadgePlugin = {
          id: "tvDistHbarLabelBadges",
          afterDraw(chart) {
            const yScale = chart.scales.y;
            const area = chart.chartArea;
            if (!yScale || !area) return;
            const { ctx: c } = chart;
            const iconSize = 22;
            const iconGap = 8;
            const colLeft = yScale.left;
            const colRight = area.left;
            const colMid = (colLeft + colRight) / 2;
            c.save();
            c.font = "700 14px Inter, Segoe UI, system-ui, sans-serif";
            c.textAlign = "left";
            c.textBaseline = "middle";
            c.fillStyle = "#f1f5f9";
            chart.data.labels.forEach((label, index) => {
              const y = yScale.getPixelForTick(index);
              const text = String(label);
              const textWidth = c.measureText(text).width;
              const blockWidth = iconSize + iconGap + textWidth;
              const iconX = Math.max(colLeft + 2, colMid - blockWidth / 2);
              const textX = iconX + iconSize + iconGap;
              const img = iconMap[label];
              if (img && img.complete && img.naturalWidth > 0) {
                c.drawImage(img, iconX, y - iconSize / 2, iconSize, iconSize);
              } else {
                c.beginPath();
                c.arc(iconX + iconSize / 2, y, 8, 0, Math.PI * 2);
                c.fillStyle = marketColor(label);
                c.fill();
                c.lineWidth = 1;
                c.strokeStyle = "rgba(255,255,255,0.25)";
                c.stroke();
                c.fillStyle = "#f1f5f9";
              }
              c.fillText(text, textX, y);
            });
            c.restore();
          }
        };
        const valueLabelPlugin = {
          id: "tvDistHbarValueLabels",
          afterDatasetsDraw(chart) {
            const meta = chart.getDatasetMeta(0);
            if (!meta?.data?.length) return;
            const { ctx: c } = chart;
            c.save();
            c.font = "700 12px Inter, Segoe UI, system-ui, sans-serif";
            c.textBaseline = "middle";
            meta.data.forEach((bar, index) => {
              const value = Number(chart.data.datasets[0].data[index]) || 0;
              const text = formatCount(value);
              const pad = 8;
              const textWidth = c.measureText(text).width;
              const inside = bar.x - bar.base > textWidth + pad * 2;
              c.textAlign = inside ? "right" : "left";
              c.fillStyle = inside ? "#ffffff" : "#e2e8f0";
              c.fillText(text, inside ? bar.x - pad : bar.x + pad, bar.y);
            });
            c.restore();
          }
        };
        donutInst2.current = new window.Chart(ctx, {
          type: "bar",
          data: {
            labels: chartRows.map((row) => row.label),
            datasets: [{
              data: chartRows.map((row) => row.value),
              backgroundColor: barColors,
              hoverBackgroundColor: hoverColors,
              borderWidth: 0,
              borderRadius: 4,
              borderSkipped: false,
              barPercentage: 0.72,
              categoryPercentage: 0.88
            }]
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 900,
              easing: "easeOutQuart"
            },
            layout: { padding: { top: 4, right: 28, bottom: 4, left: 6 } },
            plugins: {
              legend: { display: false },
              tooltip: {
                enabled: false,
                external: (context) => externalDistHbarTooltip(context, chartRows)
              }
            },
            scales: {
              x: {
                beginAtZero: true,
                max: xAxisMax,
                grace: 0,
                grid: {
                  color: "rgba(100, 116, 139, 0.18)",
                  drawBorder: false,
                  drawTicks: false
                },
                border: { display: false },
                ticks: {
                  color: "#94a3b8",
                  font: { size: 11, weight: "600" },
                  callback(value) {
                    return formatCount(Number(value) || 0);
                  },
                  maxTicksLimit: 5
                }
              },
              y: {
                grid: { display: false, drawBorder: false },
                border: { display: false },
                afterFit(scale) {
                  scale.width = Math.max(scale.width, 168);
                },
                ticks: {
                  color: "rgba(0,0,0,0)",
                  font: { size: 14, weight: "700" },
                  crossAlign: "far",
                  autoSkip: false,
                  padding: 4
                }
              }
            }
          },
          plugins: [labelBadgePlugin, valueLabelPlugin]
        });
        Promise.all(chartRows.map((row) => loadMarketplaceIcon(row.label))).then((iconRows) => {
          if (cancelled || !donutInst2.current) return;
          iconRows.forEach((row) => {
            iconMap[row.label] = row.img;
          });
          donutInst2.current.update("none");
        });
        return () => {
          cancelled = true;
          const tooltipEl = canvas.parentNode?.querySelector(".tv-dist-hbar-tooltip");
          if (tooltipEl) tooltipEl.remove();
          if (donutInst2.current) {
            donutInst2.current.destroy();
            donutInst2.current = null;
          }
        };
      }, [
        distRange2,
        trackedItemId,
        distributionData,
        dynamicMarketQuotes,
        effectiveAnalyticsBundle,
        dynamicQuoteBaseName
      ]);
      useEffect(() => {
        const canvas = provRef2.current;
        if (!canvas || !window.Chart) return void 0;
        if (provInst2.current) {
          provInst2.current.destroy();
          provInst2.current = null;
        }
        const providerSeries = resolveProviderSeries(provRange2, effectiveRemoteProviders ?? null);
        if (!providerSeries || !providerSeries.labels.length || !providerSeries.providers.length) return void 0;
        const labels = providerSeries.labels;
        const visibleProviders = providerSeries.providers.filter((provider) => !hiddenProviders.has(provider.name));
        if (!visibleProviders.length) return void 0;
        const chartProviders = compressCrowdedProviderSeries(visibleProviders);
        const providerYBounds = computeProviderChartBounds(
          collectProviderChartValues(chartProviders),
          provRange2
        );
        const ctx = canvas.getContext("2d");
        if (!ctx) return void 0;
        const datasets = chartProviders.map((provider) => ({
          type: "line",
          label: provider.name,
          data: provider.values,
          trueValues: provider.trueValues || provider.values,
          borderColor: provider.color,
          backgroundColor: "transparent",
          borderWidth: provider.sparse ? 2 : 2.6,
          borderDash: provider.sparse ? [6, 4] : [],
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBorderWidth: 2,
          pointHoverBackgroundColor: provider.color,
          tension: 0.35,
          spanGaps: !provider.sparse,
          clip: false,
          yAxisID: "y",
          order: 2
        }));
        const scales = {
          x: {
            stacked: false,
            grid: { color: "rgba(51,65,85,0.28)" },
            border: { display: false },
            ticks: {
              color: "#64748b",
              font: { size: 11 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8
            }
          },
          y: {
            beginAtZero: false,
            min: providerYBounds.min,
            max: providerYBounds.max,
            grace: "10%",
            grid: { color: "rgba(51,65,85,0.28)" },
            border: { display: false },
            ticks: {
              color: "#64748b",
              font: { size: 11 },
              maxTicksLimit: 7,
              callback: (v) => PRICE_SYMBOL + Number(v).toFixed(2)
            }
          }
        };
        provInst2.current = new window.Chart(ctx, {
          type: "line",
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 320, easing: "easeOutQuart" },
            interaction: { mode: "index", intersect: false },
            layout: { padding: { top: 14, right: 14, bottom: 10, left: 8 } },
            plugins: {
              legend: { display: false },
              tooltip: {
                enabled: false,
                external: externalProviderChartTooltip,
                filter: (item) => Number.isFinite(item.parsed?.y) && item.parsed.y > 0
              }
            },
            scales
          }
        });
        return () => {
          const tooltipEl = canvas.parentNode?.querySelector(".tv-prov-chart-tooltip");
          if (tooltipEl) tooltipEl.remove();
          if (provInst2.current) {
            provInst2.current.destroy();
            provInst2.current = null;
          }
        };
      }, [provRange2, trackedItemId, selectedInspectWear, effectiveRemoteProviders, hiddenProviders]);
      function applySteamSessionUser(user) {
        if (!user) return;
        setSteamSession(user);
        const name = String(user.persona_name || "").trim();
        const avatar = String(user.avatar || "").trim();
        if (name) {
          setSocialAuthor(name);
          if (avatar) setSocialAvatar(avatar);
          saveSocialProfile({ author: name, avatar });
        }
      }
      useEffect(() => {
        if (!isAuthenticated || !headerSessionUser) return void 0;
        applySteamSessionUser(headerSessionUser);
        return void 0;
      }, [isAuthenticated, headerSessionUser]);
      useEffect(() => {
        fetch("get_steam_session.php", { credentials: "same-origin" }).then((r) => r.ok ? r.json() : null).then((json) => {
          if (!json?.authenticated) return;
          const user = json.user || json;
          applySteamSessionUser(user);
        }).catch(() => {
        });
      }, []);
      useEffect(() => {
        const socialItemId2 = trackedItemId || stableSocialItemId(effectiveMarketHashName || String(trackedItemId || 1));
        const localFeed = loadLocalSocialFeed(socialItemId2);
        if (!trackedItemId) {
          setSocialPosts(localFeed.posts);
          setSocialReactions(localFeed.reactions);
          setSocialLoading(false);
          return void 0;
        }
        let cancelled = false;
        setSocialLoading(true);
        const params = new URLSearchParams({
          item_id: String(trackedItemId),
          item_name: effectiveMarketHashName || "",
          limit: "50"
        });
        fetch(`get_social_posts.php?${params.toString()}`, { credentials: "same-origin" }).then((response) => response.ok ? response.json() : null).then((json) => {
          if (cancelled) return;
          const apiPosts = Array.isArray(json?.posts) ? json.posts.map(formatSocialPostFromApi) : [];
          const merged = mergeSocialFeeds(apiPosts, localFeed.posts);
          setSocialPosts(applySocialReactionCounts(merged, socialItemId2));
          setSocialReactions(localFeed.reactions);
        }).catch(() => {
          if (cancelled) return;
          setSocialPosts(localFeed.posts);
          setSocialReactions(localFeed.reactions);
        }).finally(() => {
          if (!cancelled) setSocialLoading(false);
        });
        return () => {
          cancelled = true;
        };
      }, [trackedItemId, effectiveMarketHashName]);
      const multiWearSeries = useMemo(() => {
        if (!HAS_WEAR_VARIANTS) return [];
        return INSPECT_WEAR_OPTIONS.filter((option) => option.wear !== selectedInspectWear).filter((option) => !hiddenWearSeries[option.wear]).map((option) => ({
          wear: option.wear,
          short: option.short,
          color: WEAR_SERIES_COLORS[option.wear] || "#64748b",
          points: wearHistories[option.wear] || []
        })).filter((entry) => entry.points.length >= 2);
      }, [HAS_WEAR_VARIANTS, selectedInspectWear, wearHistories, hiddenWearSeries]);
      useEffect(() => {
        const container = lwContainerRef.current;
        if (!container || !window.LightweightCharts) return void 0;
        const series = resolveAnalyticsSeries(effectiveAnalyticsBundle, effectivePriceSource);
        const rawPoints = normalizeAnalyticsSeriesPoints(series?.points || []);
        const steamSeriesIsSynthetic = rawPoints.length > 0 && seriesLooksSynthetic(series);
        if (!rawPoints.length || steamSeriesIsSynthetic && analyticsLoading) {
          return void 0;
        }
        if (lwChartRef.current) {
          lwChartRef.current.remove();
          lwChartRef.current = null;
          lwAreaRef.current = null;
          lwVolRef.current = null;
        }
        const isSteamTab = effectivePriceSource === "steam" || effectivePriceSource === "all";
        const useSteamVolumeStyle = isSteamTab;
        const isSteamStyle = useSteamVolumeStyle;
        const steamVolumeScaleId = "steam-volume";
        const surfaceTheme = ANALYTICS_SOURCE_THEME.steam;
        const theme = isSteamTab ? surfaceTheme : ANALYTICS_SOURCE_THEME[effectivePriceSource] || surfaceTheme;
        const referencePrice = Number(series?.current_price || rawPoints[rawPoints.length - 1]?.price || 0);
        const displayPoints = isSteamTab ? prepareSteamChartPoints(rawPoints, priceRange, referencePrice) : prepareChartDisplaySeries(rawPoints, referencePrice, true).points;
        lwPointCountRef.current = displayPoints.length;
        const soldByDateKey = /* @__PURE__ */ new Map();
        {
          const soldSeries = isSteamTab ? series : resolveAnalyticsSeries(effectiveAnalyticsBundle, "steam");
          const soldPoints = Array.isArray(soldSeries?.points) ? soldSeries.points : [];
          soldPoints.forEach((point) => {
            const raw = point?.quantity ?? point?.volume;
            if (raw === null || raw === void 0 || raw === "") return;
            const count = Number(raw);
            if (!Number.isFinite(count) || count < 0) return;
            const key = parseChartPointDateKey(point?.date || point?.sold_at);
            if (key) soldByDateKey.set(key, count);
          });
        }
        container.classList.add("tv-lw-canvas--steam");
        const fullscreenNow = isMainChartFsActive(container.closest(".tv-chart-panel"));
        if (fullscreenNow) {
          const fsPanel = container.closest(".tv-chart-panel");
          parkChartPanelOnBody(fsPanel);
          applyFullscreenInline(fsPanel);
          lockFullscreenChartBox(fsPanel);
        }
        const initialSize = measureLightweightChartSize(container, { forceFullscreen: fullscreenNow });
        const axisOpts = lightweightChartAxisOptions(fullscreenNow);
        const chart = window.LightweightCharts.createChart(container, {
          width: initialSize.width || void 0,
          height: initialSize.height || void 0,
          layout: {
            backgroundColor: surfaceTheme.background,
            textColor: axisOpts.layout.textColor,
            fontFamily: axisOpts.layout.fontFamily,
            fontSize: axisOpts.layout.fontSize
          },
          localization: {
            locale: "en-GB",
            dateFormat: "dd/MM/yyyy",
            priceFormatter: formatSteamAxisPrice,
            timeFormatter: (time) => formatChartCrosshairDate(time, priceRange)
          },
          grid: {
            vertLines: { visible: false, color: "rgba(51, 65, 85, 0.16)" },
            horzLines: { color: surfaceTheme.grid }
          },
          crosshair: {
            mode: window.LightweightCharts.CrosshairMode.Normal,
            vertLine: {
              color: "rgba(143, 152, 160, 0.5)",
              width: 1,
              style: 2,
              labelBackgroundColor: axisOpts.crosshair.vertLine.labelBackgroundColor,
              labelVisible: false
            },
            horzLine: {
              color: "rgba(143, 152, 160, 0.5)",
              width: 1,
              style: 2,
              labelBackgroundColor: axisOpts.crosshair.horzLine.labelBackgroundColor,
              labelVisible: true
            }
          },
          rightPriceScale: {
            visible: false,
            borderColor: "transparent",
            drawLabels: false
          },
          leftPriceScale: {
            ...axisOpts.leftPriceScale
          },
          timeScale: {
            ...axisOpts.timeScale,
            visible: true,
            timeVisible: false,
            secondsVisible: false,
            fixLeftEdge: false,
            fixRightEdge: true,
            rightOffset: fullscreenNow ? 1 : 4,
            barSpacing: 4
          },
          handleScroll: { mouseWheel: true, pressedMouseMove: true },
          handleScale: { mouseWheel: true, pinch: true }
        });
        lwChartRef.current = chart;
        const steamVolumeByTime = /* @__PURE__ */ new Map();
        let primarySeries;
        if (isSteamStyle) {
          const priceValues = displayPoints.map((point) => Number(point.price)).concat(multiWearSeries.flatMap((entry) => entry.points.map((point) => Number(point.price)))).filter((value) => Number.isFinite(value) && value > 0);
          const volumeValues = displayPoints.map((point) => Math.max(0, Number(point.volume || 0)));
          const peakVolume = Math.max(1, ...volumeValues);
          const steamChartBounds = resolveSteamChartBounds(priceValues, priceRange);
          const steamAutoscale = buildSteamPriceAutoscaleProvider(steamChartBounds, priceValues);
          const steamPriceData = displayPoints.map((point) => ({
            time: toSteamChartTime(point.date),
            value: formatChartPriceValue(Number(point.price))
          }));
          const areaSeries = chart.addAreaSeries({
            lineColor: "transparent",
            topColor: theme.fillTop,
            bottomColor: theme.fillBottom,
            priceScaleId: "left",
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: steamAutoscale
          });
          areaSeries.setData(steamPriceData);
          primarySeries = chart.addLineSeries({
            color: theme.line,
            lineWidth: 2,
            priceScaleId: "left",
            crosshairMarkerRadius: 3,
            crosshairMarkerBorderWidth: 1.5,
            crosshairMarkerBorderColor: theme.line,
            crosshairMarkerBackgroundColor: "#1a1e2e",
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: steamAutoscale
          });
          lwAreaRef.current = primarySeries;
          if (multiWearSeries.length) {
            multiWearSeries.forEach((entry) => {
              const wearPoints = prepareSteamChartPoints(entry.points, priceRange, referencePrice);
              if (wearPoints.length < 2) return;
              const wearSeries = chart.addLineSeries({
                color: entry.color,
                lineWidth: 1,
                priceScaleId: "left",
                crosshairMarkerRadius: 2,
                crosshairMarkerBorderColor: entry.color,
                crosshairMarkerBackgroundColor: "#1a1e2e",
                lastValueVisible: false,
                priceLineVisible: false,
                autoscaleInfoProvider: steamAutoscale
              });
              wearSeries.setData(wearPoints.map((point) => ({
                time: toSteamChartTime(point.date),
                value: formatChartPriceValue(Number(point.price))
              })));
            });
          }
          const volumeSeries = typeof chart.addHistogramSeries === "function" ? chart.addHistogramSeries({
            color: theme.volumeUp,
            priceScaleId: steamVolumeScaleId,
            priceFormat: { type: "volume" },
            scaleMargins: { top: 0.55, bottom: 0.02 },
            base: 0,
            lastValueVisible: false,
            priceLineVisible: false
          }) : chart.addAreaSeries({
            lineColor: theme.volumeLine,
            topColor: theme.volumeFillTop,
            bottomColor: theme.volumeFillBottom,
            lineWidth: 1,
            priceScaleId: steamVolumeScaleId,
            scaleMargins: { top: 0.55, bottom: 0.02 },
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false
          });
          lwVolRef.current = volumeSeries;
          chart.priceScale("left").applyOptions({
            autoScale: true,
            // Bottom margin only pads visual space within THIS scale's own mapped
            // range — it doesn't need to "make room" for the volume histogram
            // (that's a separate priceScaleId with its own margins below). A big
            // bottom margin here just extrapolates the price axis linearly below
            // the real minimum, which is why it was drawing negative € ticks.
            scaleMargins: { top: 0.08, bottom: 0.02 },
            borderVisible: true,
            visible: true,
            drawLabels: true,
            drawTicks: true,
            minimumWidth: fullscreenNow ? 80 : 72,
            entireTextOnly: false,
            textColor: axisOpts.layout.textColor
          });
          chart.priceScale(steamVolumeScaleId).applyOptions({
            autoScale: true,
            scaleMargins: { top: 0.55, bottom: 0 },
            borderVisible: false,
            visible: false,
            drawLabels: false
          });
          chart.priceScale("right").applyOptions({
            visible: false,
            drawLabels: false,
            borderVisible: false
          });
          primarySeries.setData(steamPriceData);
          volumeSeries.setData(displayPoints.map((point, index) => {
            const time = toSteamChartTime(point.date);
            const value = volumeValues[index];
            steamVolumeByTime.set(time, value);
            steamVolumeByTime.set(String(time), value);
            const dateKey = parseChartPointDateKey(point.date);
            if (dateKey) steamVolumeByTime.set(dateKey, value);
            return {
              time,
              value,
              ...typeof chart.addHistogramSeries === "function" ? { color: formatSteamVolumeBarColor(value, peakVolume) } : {}
            };
          }));
          lwVolRef.current = volumeSeries;
        } else {
          const priceValues = displayPoints.map((point) => Number(point.price));
          const marketChartBounds = resolveSteamChartBounds(priceValues, priceRange);
          const marketAutoscale = buildSteamPriceAutoscaleProvider(marketChartBounds, priceValues);
          const marketPriceData = displayPoints.map((point) => ({
            time: String(point.date).slice(0, 10),
            value: formatChartPriceValue(Number(point.price))
          }));
          primarySeries = chart.addAreaSeries({
            lineColor: "transparent",
            topColor: theme.fillTop,
            bottomColor: theme.fillBottom,
            priceScaleId: "left",
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: marketAutoscale
          });
          primarySeries.setData(marketPriceData);
          const lineSeries = chart.addLineSeries({
            color: theme.line,
            lineWidth: 2,
            priceScaleId: "left",
            crosshairMarkerRadius: 5,
            crosshairMarkerBorderColor: theme.line,
            crosshairMarkerBackgroundColor: "#1a1e2e",
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: marketAutoscale
          });
          lineSeries.setData(marketPriceData);
          primarySeries = lineSeries;
          lwAreaRef.current = lineSeries;
          chart.priceScale("left").applyOptions({
            autoScale: true,
            scaleMargins: { top: 0.22, bottom: 0.02 },
            borderVisible: true,
            visible: true,
            drawLabels: true,
            drawTicks: true,
            minimumWidth: fullscreenNow ? 80 : 72,
            entireTextOnly: false,
            textColor: axisOpts.layout.textColor
          });
          chart.priceScale("right").applyOptions({
            visible: false,
            drawLabels: false,
            borderVisible: false
          });
        }
        chart.timeScale().fitContent();
        const scaleWidth = fullscreenNow ? initialSize.width || Math.max(48, Math.floor((window.innerWidth || 0) - fullscreenChartLeftPx())) : initialSize.width || Math.floor(container.clientWidth);
        syncLightweightTimeScale(chart, scaleWidth, displayPoints.length, { fullscreen: fullscreenNow });
        const wrap = container.closest(".tv-lw-wrap");
        if (wrap && lwTimeLabelRef.current && lwTimeLabelRef.current.parentElement !== wrap) {
          wrap.appendChild(lwTimeLabelRef.current);
        }
        const hideChartHoverChrome = () => {
          const tooltip = lwTooltipRef.current;
          const timeLabel = lwTimeLabelRef.current;
          if (tooltip) tooltip.style.display = "none";
          if (timeLabel) {
            timeLabel.classList.remove("is-visible");
            timeLabel.style.display = "none";
          }
        };
        const readSoldFromSteamSeries = (time) => {
          const key = chartTimeKey(time);
          if (key && soldByDateKey.has(key)) return soldByDateKey.get(key);
          return null;
        };
        const readSteamSoldCount = (param) => {
          if (!useSteamVolumeStyle) return readSoldFromSteamSeries(param.time);
          const series2 = lwVolRef.current;
          const seriesPoint = series2 && param.seriesData && typeof param.seriesData.get === "function" ? param.seriesData.get(series2) : null;
          const seriesVal = Number(seriesPoint?.value);
          if (Number.isFinite(seriesVal)) return Math.max(0, seriesVal);
          const time = param.time;
          if (steamVolumeByTime.has(time)) return steamVolumeByTime.get(time);
          if (steamVolumeByTime.has(String(time))) return steamVolumeByTime.get(String(time));
          const key = chartTimeKey(time);
          if (key && steamVolumeByTime.has(key)) return steamVolumeByTime.get(key);
          return 0;
        };
        const placeTimeAxisLabel = (pointX, dateStr, soldLine) => {
          const timeLabel = lwTimeLabelRef.current;
          if (!timeLabel || !wrap) return;
          if (timeLabel.parentElement !== wrap) {
            wrap.appendChild(timeLabel);
          }
          const dateText = dateStr || "";
          const soldText = soldLine || "";
          timeLabel.innerHTML = soldText ? `<span class="tv-lw-time-axis-date">${dateText}</span><span class="tv-lw-time-axis-sold">${soldText}</span>` : `<span class="tv-lw-time-axis-date">${dateText}</span>`;
          timeLabel.classList.add("is-visible");
          timeLabel.style.display = "block";
          timeLabel.style.visibility = "visible";
          timeLabel.style.opacity = "1";
          timeLabel.style.zIndex = "80";
          const { plotCell, timeAxisCell } = findLightweightTimeAxisParts(container);
          if (timeAxisCell) {
            timeAxisCell.style.overflow = "visible";
            timeAxisCell.style.minHeight = "40px";
            const timeRow = timeAxisCell.parentElement;
            if (timeRow) {
              timeRow.style.overflow = "visible";
            }
          }
          const host = container.firstElementChild;
          if (host && host.style) {
            host.style.overflow = "visible";
          }
          container.style.overflow = "visible";
          const wrapRect = wrap.getBoundingClientRect();
          const paneRect = (plotCell || timeAxisCell)?.getBoundingClientRect();
          const axisRect = timeAxisCell?.getBoundingClientRect();
          const labelWidth = Math.max(timeLabel.offsetWidth || 0, 52);
          const labelHeight = Math.max(timeLabel.offsetHeight || 0, soldText ? 32 : 18);
          const paneLeft = paneRect ? paneRect.left - wrapRect.left : container.offsetLeft || 0;
          const paneRight = paneRect ? paneRect.right - wrapRect.left : paneLeft + (container.clientWidth || labelWidth);
          const rawLeft = paneLeft + pointX;
          const minLeft = paneLeft + labelWidth / 2 + 2;
          const maxLeft = paneRight - labelWidth / 2 - 2;
          timeLabel.style.left = `${Math.max(minLeft, Math.min(maxLeft, rawLeft))}px`;
          const axisTop = axisRect ? axisRect.top - wrapRect.top : (container.offsetTop || 0) + (container.clientHeight || 0) - 40;
          const axisHeight = Math.max(axisRect?.height || 0, 40);
          const maxTop = wrapRect.height - labelHeight - 2;
          const centeredTop = axisTop + (axisHeight - labelHeight) / 2;
          timeLabel.style.top = `${Math.max(2, Math.min(maxTop, Math.round(centeredTop)))}px`;
        };
        chart.subscribeCrosshairMove((param) => {
          const tooltip = lwTooltipRef.current;
          if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
            hideChartHoverChrome();
            return;
          }
          const dateStr = formatChartCrosshairDate(param.time, priceRange) || String(param.time);
          const volumeValue = readSteamSoldCount(param);
          const soldLine = volumeValue != null ? `${formatCount(volumeValue)} sold` : "";
          let pointX = param.point.x;
          try {
            const coord = chart.timeScale().timeToCoordinate(param.time);
            if (coord != null && Number.isFinite(Number(coord))) pointX = Number(coord);
          } catch (_err) {
          }
          placeTimeAxisLabel(pointX, dateStr, soldLine);
          const pricePoint = param.seriesData.get(primarySeries);
          if (!tooltip || !pricePoint) {
            if (tooltip) tooltip.style.display = "none";
            return;
          }
          const priceValue = pricePoint.value ?? 0;
          tooltip.innerHTML = volumeValue != null ? `<div class="lw-tip-date">${dateStr}</div><div class="lw-tip-price">${PRICE_SYMBOL}${Number(priceValue).toFixed(2)}</div><div class="lw-tip-vol">${useSteamVolumeStyle ? "Volume" : "Steam volume"}: ${formatCount(volumeValue)}</div>` : `<div class="lw-tip-date">${dateStr}</div><div class="lw-tip-price">${PRICE_SYMBOL}${Number(priceValue).toFixed(2)}</div>`;
          tooltip.style.display = "block";
          tooltip.style.zIndex = "81";
          const boundsWidth = wrap?.clientWidth || container.clientWidth || 0;
          const boundsHeight = wrap?.clientHeight || container.clientHeight || 0;
          const tipWidth = 150;
          const tipHeight = 72;
          const rawLeft = param.point.x > boundsWidth / 2 ? param.point.x - tipWidth - 8 : param.point.x + 12;
          const left = Math.max(8, Math.min(rawLeft, boundsWidth - tipWidth - 8));
          const top = Math.max(8, Math.min(param.point.y - 64, boundsHeight - tipHeight - 8));
          tooltip.style.left = `${left}px`;
          tooltip.style.top = `${top}px`;
        });
        const panel = container.closest(".tv-chart-panel");
        const resizeObservedChart = () => {
          const fs = isMainChartFsActive(panel);
          scheduleLightweightChartResize(fs ? "fullscreen" : "default");
        };
        const ro = typeof ResizeObserver === "function" ? new ResizeObserver(resizeObservedChart) : null;
        ro?.observe(container);
        if (wrap && wrap !== container) {
          ro?.observe(wrap);
        }
        if (panel && panel !== container) {
          ro?.observe(panel);
        }
        window.addEventListener("resize", resizeObservedChart);
        scheduleLightweightChartResize(fullscreenNow || isMainChartFsActive(panel) ? "fullscreen" : "default");
        return () => {
          hideChartHoverChrome();
          ro?.disconnect();
          window.removeEventListener("resize", resizeObservedChart);
          container.classList.remove("tv-lw-canvas--steam");
          if (lwChartRef.current) {
            lwChartRef.current.remove();
            lwChartRef.current = null;
            lwAreaRef.current = null;
            lwVolRef.current = null;
          }
        };
      }, [effectiveAnalyticsBundle, effectivePriceSource, priceRange, analyticsLoading, singleMarketActivity, isCaseItemView, multiWearSeries]);
      const analyticsSelectedSeries = resolveAnalyticsSeries(effectiveAnalyticsBundle, effectivePriceSource);
      const analyticsPoints = normalizeAnalyticsSeriesPoints(analyticsSelectedSeries?.points || []);
      const analyticsCards = (effectiveAnalyticsBundle?.snapshot_cards || []).filter((card) => card.id !== "all" && Number.isFinite(Number(card.price)));
      const selectedAnalyticsCard = analyticsCards.find((card) => card.id === effectivePriceSource) || null;
      const analyticsPriceValues = analyticsPoints.map((point) => Number(point.price || 0));
      const analyticsVolumeValues = analyticsPoints.map((point) => Number(point.volume || 0));
      const analyticsCurrentPrice = Number(
        analyticsSelectedSeries?.current_price ?? selectedAnalyticsCard?.price ?? analyticsPriceValues[analyticsPriceValues.length - 1] ?? 0
      );
      const hasAnalyticsCurrentPrice = Number.isFinite(analyticsCurrentPrice) && analyticsCurrentPrice > 0;
      const analyticsChartFeePct = (() => {
        const sourceMarketMap = {
          steam: "Steam Market",
          skinport: "skinport",
          csfloat: "CSFloat",
          white_market: "White.Market",
          dmarket: "DMarket",
          market_csgo: "Market.CSGO",
          shadowpay: "ShadowPay",
          waxpeer: "Waxpeer",
          mannco: "Mannco.store",
          haloskins: "HaloSkins",
          rapidskins: "RapidSkins",
          all: "Steam Market"
        };
        const marketName = sourceMarketMap[effectivePriceSource] || sourceMarketMap.steam;
        const marketRow = marketRowsData.find((row) => row && canonicalMarketName(row.name) === canonicalMarketName(marketName));
        const parsedFee = parseNumericDisplay(marketRow?.fee);
        if (Number.isFinite(parsedFee) && parsedFee > 0) return parsedFee;
        return effectivePriceSource === "steam" || effectivePriceSource === "all" ? 15 : 0;
      })();
      const analyticsChartPrice = (() => {
        if (hasAnalyticsCurrentPrice) {
          const value = Number(analyticsCurrentPrice);
          return Number(value.toFixed(value < 1 ? 4 : 2));
        }
        const steamRow = marketRowsData.find((row) => row && canonicalMarketName(row.name) === canonicalMarketName("Steam Market"));
        const steamAfterTax = parseNumericDisplay(steamRow?.basePrice);
        if (Number.isFinite(steamAfterTax) && steamAfterTax > 0) {
          return steamAfterTax;
        }
        return null;
      })();
      const hasAnalyticsChartPrice = Number.isFinite(analyticsChartPrice) && analyticsChartPrice > 0;
      const analyticsCurrentVolume = Number(
        analyticsSelectedSeries?.current_volume ?? selectedAnalyticsCard?.volume ?? analyticsVolumeValues[analyticsVolumeValues.length - 1] ?? 0
      );
      const analyticsDelta = computeSeriesRangeTrend(analyticsPoints);
      const analyticsBadges = [
        { label: "24H", value: computeSeriesTrendByDays(analyticsPoints, 1) },
        { label: "7D", value: computeSeriesTrendByDays(analyticsPoints, 7) },
        { label: "30D", value: computeSeriesTrendByDays(analyticsPoints, 30) },
        { label: "90D", value: computeSeriesTrendByDays(analyticsPoints, 90) }
      ];
      const analyticsSubtitle = HAS_WEAR_VARIANTS ? buildAnalyticsSubtitle(analyticsSelectedSeries, ITEM_DETAILS.title, selectedInspectWear) : `Historical Steam market data for ${ITEM_DETAILS.title}`;
      const analyticsUpdatedAt = analyticsSelectedSeries?.updated_at || selectedAnalyticsCard?.updated_at || analyticsCards[0]?.updated_at || "";
      const analyticsAverageVolume = analyticsVolumeValues.length ? Math.round(analyticsVolumeValues.reduce((sum, value) => sum + value, 0) / analyticsVolumeValues.length) : 0;
      const analyticsPeakVolume = analyticsVolumeValues.length ? Math.max(...analyticsVolumeValues) : 0;
      const analyticsSourceSpread = analyticsCards.length >= 2 ? Math.abs(Number(analyticsCards[0].price || 0) - Number(analyticsCards[1].price || 0)) : 0;
      const analyticsSpreadTone = analyticsCards.length >= 2 ? Number(analyticsCards[0].price || 0) <= Number(analyticsCards[1].price || 0) ? "up" : "down" : "flat";
      const analyticsNote = analyticsError || analyticsSelectedSeries?.note || "";
      const toolbarSourceOptions = HAS_WEAR_VARIANTS ? WEAR_TABLE_SOURCES.map((entry) => ({ id: entry.id, label: entry.label })) : PRICE_SOURCE_OPTIONS.filter(function(o) {
        return USES_EXACT_MARKET_ACTIVITY ? o.id !== "all" : o.id === "steam";
      });
      const activeMarketLabel = sourceMarketplaceLabel(effectivePriceSource);
      const activeMarketIcon = sourceMarketplaceIcon(effectivePriceSource);
      const activeAlertKey = [
        trackedItemId || "item",
        selectedInspectWear || "any",
        effectivePriceSource || "market"
      ].join(":");
      const currentAlertPrice = hasAnalyticsCurrentPrice ? analyticsCurrentPrice : 0;
      const chartSteamSeries = resolveAnalyticsSeries(effectiveAnalyticsBundle, "steam");
      const chartSteamPrice = positivePrice(chartSteamSeries?.current_price);
      const wearVariantKind = resolveWearVariantKind(itemTitle, skinOriginName, qualityRows);
      const showStatTrakWearColumn = HAS_WEAR_VARIANTS && wearVariantKind === "stattrak";
      const showSouvenirWearColumn = HAS_WEAR_VARIANTS && wearVariantKind === "souvenir";
      const multiMarketWearRows = HAS_WEAR_VARIANTS ? mergeLiveWearIntoMultiMarketRows(
        buildMultiMarketWearTableRows(
          effectiveAnalyticsBundle,
          dynamicQuoteBaseName,
          selectedInspectWear,
          skinOriginName
        ),
        qualityRows,
        dynamicMarketQuotes,
        dynamicQuoteBaseName,
        {
          selectedWear: selectedInspectWear,
          chartSteamPrice,
          analyticsBundle: effectiveAnalyticsBundle,
          singleMarketActivity,
          originName: skinOriginName
        }
      ).filter((row) => activeWearOptions.some((option) => option.wear === row.wear)) : [];
      const activeWearTableSource = WEAR_TABLE_SOURCES.find((entry) => entry.id === wearTableSource) || WEAR_TABLE_SOURCES[0];
      const chartMotionKey = [
        effectivePriceSource,
        priceRange,
        selectedInspectWear,
        analyticsSelectedSeries?.updated_at || "",
        analyticsPoints.length
      ].join(":");
      useEffect(() => {
        if (!isMainChartFullscreen) {
          drawToolsApiRef.current?.destroy?.();
          drawToolsApiRef.current = null;
          scheduleLightweightChartResize();
          return void 0;
        }
        let cancelled = false;
        scheduleLightweightChartResize("fullscreen");
        const mountWhenReady = () => {
          if (cancelled) return;
          const container = lwContainerRef.current;
          const wrap = container?.closest(".tv-lw-wrap");
          const chart = lwChartRef.current;
          const series = lwAreaRef.current;
          if (!container || !wrap || !chart || !series || !window.CS2ChartDraw?.mount) {
            window.requestAnimationFrame(mountWhenReady);
            return;
          }
          drawToolsApiRef.current?.destroy?.();
          drawToolsApiRef.current = window.CS2ChartDraw.mount({
            wrap,
            container,
            getChart: () => lwChartRef.current,
            getSeries: () => lwAreaRef.current,
            getTool: () => drawToolRef.current
          });
          drawToolsApiRef.current?.updateOverlayPointer?.();
          scheduleLightweightChartResize("fullscreen");
        };
        const timeoutId = window.setTimeout(mountWhenReady, 0);
        return () => {
          cancelled = true;
          window.clearTimeout(timeoutId);
          drawToolsApiRef.current?.destroy?.();
          drawToolsApiRef.current = null;
        };
      }, [isMainChartFullscreen]);
      useEffect(() => {
        if (!isMainChartFullscreen) return void 0;
        const applyTool = (toolId) => {
          if (!toolId) return;
          if (toolId === "clear") {
            drawToolsApiRef.current?.clearDrawings?.();
            drawToolRef.current = "cursor";
            setDrawTool("cursor");
            drawToolsApiRef.current?.updateOverlayPointer?.();
            return;
          }
          drawToolRef.current = toolId;
          setDrawTool(toolId);
          drawToolsApiRef.current?.updateOverlayPointer?.();
        };
        const onDrawToolClick = (event) => {
          const btn = event.target?.closest?.(".tv-draw-tool-btn");
          if (!btn) return;
          const toolId = btn.getAttribute("data-draw-tool");
          if (!toolId) return;
          event.preventDefault();
          event.stopPropagation();
          applyTool(toolId);
        };
        document.addEventListener("click", onDrawToolClick, true);
        document.addEventListener("pointerdown", onDrawToolClick, true);
        return () => {
          document.removeEventListener("click", onDrawToolClick, true);
          document.removeEventListener("pointerdown", onDrawToolClick, true);
        };
      }, [isMainChartFullscreen]);
      const inventorySection = inventorySectionLabel(QUERY_TYPE);
      const titleParts = ITEM_DETAILS.title.split("|").map((part) => part.trim()).filter(Boolean);
      const inventoryWeapon = titleParts[0] || ITEM_DETAILS.title;
      const inventoryFinish = titleParts[1] || activeInspectShort;
      const existingAlert = readStoredArray(PRICE_ALERTS_KEY).find((item) => item.key === activeAlertKey) || null;
      const handlePriceAlertClick = () => {
        if (!isAuthenticated) {
          promptSocialLogin();
          return;
        }
        setAlertModalOpen(true);
      };
      const CaseSimulator = window.CS2CaseSimulator && window.CS2CaseSimulator.CaseSimulator ? window.CS2CaseSimulator.CaseSimulator : null;
      const isTerminal = isTerminalContainer(ITEM_DETAILS.title);
      const [terminalSimTick, setTerminalSimTick] = useState(0);
      useEffect(() => {
        if (!isTerminal || window.CS2TerminalSimulator) return void 0;
        if (document.querySelector("script[data-cs2-terminal-sim]")) return void 0;
        const script = document.createElement("script");
        script.src = "react/terminal-simulator.build.js?v=20260914-selfload-2";
        script.setAttribute("data-cs2-terminal-sim", "1");
        script.onload = () => setTerminalSimTick((n) => n + 1);
        document.body.appendChild(script);
        return void 0;
      }, [isTerminal]);
      const TerminalSimulator = window.CS2TerminalSimulator && window.CS2TerminalSimulator.TerminalSimulator ? window.CS2TerminalSimulator.TerminalSimulator : null;
      const canSimulateContainer = looksLikeOpenableContainer(ITEM_DETAILS.title, visualType, isCaseItemView) && caseSimContentsReady !== false;
      const caseSimOpenCost = (() => {
        const casePrice = positivePrice(dynamicMarketQuotes?.steam?.price) ?? parseSteamPriceDisplay(singleMarketActivity?.summary?.starting_price) ?? parseSteamPriceDisplay(singleMarketActivity?.summary?.suggested_price) ?? parseSteamPriceDisplay(singleMarketActivity?.summary?.starting_price_display) ?? parseSteamPriceDisplay(singleMarketActivity?.summary?.suggested_price_display) ?? chartSteamPrice ?? positivePrice(caseMetaEntry?.seed_sell_price) ?? 0;
        if (!(casePrice > 0)) return null;
        const keyCost = containerNeedsKey(ITEM_DETAILS.title, isCaseItemView) ? CASE_SIM_KEY_COST : 0;
        return Number((casePrice + keyCost).toFixed(2));
      })();
      useEffect(() => {
        if (!isCaseItemView) {
          setCaseOdds(null);
          return void 0;
        }
        let cancelled = false;
        setCaseOddsLoading(true);
        fetch("get_case_odds.php?name=" + encodeURIComponent(ITEM_DETAILS.title), {
          headers: { Accept: "application/json" }
        }).then((res) => res.ok ? res.json() : null).then((payload) => {
          if (cancelled) return;
          if (payload && payload.success && Array.isArray(payload.tiers) && payload.tiers.length) {
            setCaseOdds(payload);
          } else {
            setCaseOdds(null);
          }
        }).catch(() => {
          if (!cancelled) setCaseOdds(null);
        }).finally(() => {
          if (!cancelled) setCaseOddsLoading(false);
        });
        return () => {
          cancelled = true;
        };
      }, [isCaseItemView, ITEM_DETAILS.title]);
      const caseOddsSummary = useMemo(() => {
        if (!caseOdds || !Array.isArray(caseOdds.tiers) || !caseOdds.tiers.length) return null;
        const isTerminal2 = isTerminalContainer(ITEM_DETAILS.title);
        const keyCost = containerNeedsKey(ITEM_DETAILS.title, isCaseItemView) ? CASE_SIM_KEY_COST : 0;
        const casePriceForMath = caseSimOpenCost != null ? Number((caseSimOpenCost - keyCost).toFixed(4)) : caseOdds.case_price;
        if (!(casePriceForMath > 0)) return null;
        const liveItems = caseSimConfig && Array.isArray(caseSimConfig.items) ? caseSimConfig.items : [];
        const liveTierPrices = /* @__PURE__ */ new Map();
        if (liveItems.length && contentsPriceMap.size) {
          liveItems.forEach((item, index) => {
            const priced = contentsPriceMap.get(contentsItemKey(item, index));
            if (!priced || !(priced.price > 0)) return;
            const tierKey = String(item.rarity || "milspec").toLowerCase();
            if (!liveTierPrices.has(tierKey)) liveTierPrices.set(tierKey, []);
            liveTierPrices.get(tierKey).push(priced.price);
          });
        }
        const tiers = caseOdds.tiers.map((tier) => {
          const livePrices = liveTierPrices.get(tier.key);
          const avgValue = livePrices && livePrices.length ? livePrices.reduce((sum, price) => sum + price, 0) / livePrices.length : tier.avg_value;
          return {
            ...tier,
            avg_value: avgValue,
            addsToEv: tier.chance * avgValue
          };
        });
        const expectedValue = tiers.reduce((sum, tier) => sum + tier.addsToEv, 0);
        const rareTier = tiers.find((tier) => tier.key === "rare_special") || tiers[0];
        const openingsToHitRare = rareTier && rareTier.chance > 0 ? 1 / rareTier.chance : null;
        const openingCost = caseSimOpenCost;
        if (!(openingCost > 0)) return null;
        return {
          openingCost,
          casePrice: casePriceForMath,
          keyCost,
          isTerminal: isTerminal2,
          expectedValue,
          getBackPct: expectedValue / openingCost * 100,
          openingsToHitRare,
          costToHitRare: openingsToHitRare != null ? openingsToHitRare * openingCost : null,
          tiers
        };
      }, [caseOdds, caseSimOpenCost, isCaseItemView, ITEM_DETAILS.title, caseSimConfig, contentsPriceMap]);
      const openCaseSimulation = () => {
        setCaseSimError("");
        setCaseSimOpen(true);
        if (caseSimConfig && Array.isArray(caseSimConfig.items) && caseSimConfig.items.length >= 2) {
          return;
        }
        setCaseSimLoading(true);
        loadCaseSimulationContents(ITEM_DETAILS.title).then(({ items, equalWeight }) => {
          if (!items || items.length < 2) {
            setCaseSimContentsReady(false);
            setCaseSimError("Could not load container contents for this item.");
            setCaseSimConfig(null);
            return;
          }
          setCaseSimContentsReady(true);
          setCaseSimEqualWeight(Boolean(equalWeight));
          setCaseSimConfig({
            title: ITEM_DETAILS.title,
            image: activeWeaponImage || ITEM_DETAILS.image || "",
            items,
            equalWeight: Boolean(equalWeight)
          });
        }).catch(() => {
          setCaseSimError("Could not load container contents for this item.");
          setCaseSimContentsReady(false);
        }).finally(() => setCaseSimLoading(false));
      };
      useEffect(() => {
        if (!looksLikeOpenableContainer(ITEM_DETAILS.title, visualType, isCaseItemView)) {
          if (caseSimContentsReady !== false) setCaseSimContentsReady(false);
          return void 0;
        }
        if (caseSimContentsReady !== null) return void 0;
        let cancelled = false;
        loadCaseSimulationContents(ITEM_DETAILS.title).then(({ items, equalWeight }) => {
          if (cancelled) return;
          if (!items || items.length < 2) {
            setCaseSimContentsReady(false);
            return;
          }
          setCaseSimContentsReady(true);
          setCaseSimEqualWeight(Boolean(equalWeight));
          setCaseSimConfig({
            title: ITEM_DETAILS.title,
            image: activeWeaponImage || ITEM_DETAILS.image || "",
            items,
            equalWeight: Boolean(equalWeight)
          });
        }).catch(() => {
          if (!cancelled) setCaseSimContentsReady(false);
        });
        return () => {
          cancelled = true;
        };
      }, [ITEM_DETAILS.title, visualType, isCaseItemView, caseSimContentsReady, activeWeaponImage, ITEM_DETAILS.image]);
      useEffect(() => {
        const items = caseSimConfig && Array.isArray(caseSimConfig.items) ? caseSimConfig.items : [];
        if (!canSimulateContainer || items.length < 2) {
          setContentsPriceMap(/* @__PURE__ */ new Map());
          setContentsPricesLoading(false);
          return void 0;
        }
        let cancelled = false;
        setContentsPricesLoading(true);
        fetchContentsSteamPrices(items).then((priceMap) => {
          if (!cancelled) setContentsPriceMap(priceMap);
        }).catch(() => {
          if (!cancelled) setContentsPriceMap(/* @__PURE__ */ new Map());
        }).finally(() => {
          if (!cancelled) setContentsPricesLoading(false);
        });
        return () => {
          cancelled = true;
        };
      }, [canSimulateContainer, caseSimConfig]);
      const containerContentsCards = useMemo(() => {
        const items = caseSimConfig && Array.isArray(caseSimConfig.items) ? caseSimConfig.items : [];
        if (items.length < 2) return [];
        const simApi = window.CS2CaseSimulator || {};
        const wearFn = typeof simApi.wearOptionsForItem === "function" ? simApi.wearOptionsForItem : () => ["Factory New"];
        return items.map((item, index) => {
          const key = contentsItemKey(item, index);
          const priced = contentsPriceMap.get(key) || null;
          const wearLabel = item.noWear ? "" : wearFn(item)[0] || "Factory New";
          const rarityLabel = contentsRarityLabel(item.rarity, item.badge, t);
          const subtitle = wearLabel ? `${wearLabel} - ${rarityLabel}` : rarityLabel;
          return {
            key,
            item,
            title: contentsDisplayName(item),
            subtitle,
            rarity: String(item.rarity || "milspec").toLowerCase(),
            rarityHex: contentsRarityHex(item.rarity),
            rarityLabel,
            priceDisplay: priced?.display || null,
            price: priced?.price || null,
            href: contentsItemHref(item, priced?.marketHashName),
            img: item.img || ""
          };
        }).sort((left, right) => {
          const rarityDiff = contentsRarityRank(left.rarity) - contentsRarityRank(right.rarity);
          if (rarityDiff !== 0) return rarityDiff;
          return Number(right.price || 0) - Number(left.price || 0);
        });
      }, [caseSimConfig, contentsPriceMap]);
      const handleSavePriceAlert = ({ min, max, email }) => {
        if (!isAuthenticated) {
          promptSocialLogin();
          return;
        }
        const current = Number(currentAlertPrice);
        const alerts = readStoredArray(PRICE_ALERTS_KEY);
        const alert = {
          key: activeAlertKey,
          title: ITEM_DETAILS.title + (selectedInspectWear ? " (" + selectedInspectWear + ")" : ""),
          itemId: trackedItemId,
          wear: selectedInspectWear,
          source: effectivePriceSource,
          sourceLabel: activeMarketLabel,
          min,
          max,
          email,
          currentPrice: Number.isFinite(current) && current > 0 ? current : null,
          href: window.location.href,
          image: activeWeaponImage || ITEM_DETAILS.image || "",
          createdAt: Date.now(),
          lastTriggerKey: ""
        };
        const checkedAlert = Number.isFinite(current) && current > 0 ? evaluatePriceAlert(alert, current, false) : alert;
        const next = [checkedAlert, ...alerts.filter((item) => item.key !== activeAlertKey)].slice(0, 80);
        writeStoredArray(PRICE_ALERTS_KEY, next);
        window.dispatchEvent(new CustomEvent("cs2:price-alerts-updated"));
        setAlertModalOpen(false);
      };
      useEffect(() => {
        if (!isAuthenticated || !hasAnalyticsCurrentPrice) return;
        const priceCents = alertPriceCents(analyticsCurrentPrice);
        if (priceCents == null) return;
        const alerts = readStoredArray(PRICE_ALERTS_KEY);
        let changed = false;
        const next = alerts.map((alert) => {
          if (alert.key !== activeAlertKey) return alert;
          const evaluated = evaluatePriceAlert(alert, analyticsCurrentPrice, true);
          if (evaluated.lastTriggerKey !== alert.lastTriggerKey || alertPriceCents(evaluated.currentPrice) !== alertPriceCents(alert.currentPrice) || evaluated.triggeredAt !== alert.triggeredAt) {
            changed = true;
          }
          return evaluated;
        });
        if (changed) {
          writeStoredArray(PRICE_ALERTS_KEY, next);
          window.dispatchEvent(new CustomEvent("cs2:price-alerts-updated"));
        }
      }, [activeAlertKey, analyticsCurrentPrice, hasAnalyticsCurrentPrice, isAuthenticated]);
      const chartDistRows = buildDistributionChartRows(
        distributionData,
        dynamicMarketQuotes,
        effectiveAnalyticsBundle,
        dynamicQuoteBaseName || ITEM_DETAILS.title,
        selectedInspectWear,
        HAS_WEAR_VARIANTS
      );
      const distEntries = chartDistRows.map((row) => ({
        marketplace: row.label,
        volume: row.value,
        pct: 0
      }));
      const distTotal = Math.max(1, distEntries.reduce(function(s, e) {
        return s + (Number(e.volume) || 0);
      }, 0));
      distEntries.forEach((entry) => {
        entry.pct = Number(((Number(entry.volume) || 0) / distTotal * 100).toFixed(2));
      });
      const providerSeriesPreview = resolveProviderSeries(provRange2, effectiveRemoteProviders ?? null);
      const providerLegend = providerSeriesPreview?.providers || [];
      const visibleProviderCount = providerLegend.filter((provider) => !hiddenProviders.has(provider.name)).length;
      function toggleProviderVisibility(name) {
        setHiddenProviders((prev) => {
          const next = new Set(prev);
          if (next.has(name)) {
            next.delete(name);
          } else {
            next.add(name);
          }
          return next;
        });
      }
      const distRegions = ["east", "west"].map(function(region) {
        const entries = distEntries.filter(function(entry) {
          return getMarketplaceMeta(entry.marketplace).region === region;
        });
        const volume = entries.reduce(function(sum, entry) {
          return sum + (Number(entry.volume) || 0);
        }, 0);
        return {
          id: region,
          label: region === "east" ? "Eastern Markets" : "Western Markets",
          icon: region === "east" ? "fa-solid fa-globe" : "fa-solid fa-earth-americas",
          share: distTotal > 0 ? volume / distTotal * 100 : 0,
          markets: entries.map(function(entry) {
            return entry.marketplace;
          }).join(", ") || "No tracked markets"
        };
      });
      const easternShare = distRegions[0]?.share || 0;
      const westernShare = distRegions[1]?.share || 0;
      const COMPARE_MARKET_TABS = [
        { id: "steam", label: "Steam", quoteKey: "steam" },
        { id: "skinport", label: "Skinport", quoteKey: "skinport" },
        { id: "csfloat", label: "CSFloat", quoteKey: "csfloat" },
        { id: "white_market", label: "White.Market", quoteKey: "white_market" },
        { id: "dmarket", label: "DMarket", quoteKey: "dmarket" },
        { id: "market_csgo", label: "Market.CSGO", quoteKey: "market_csgo" },
        { id: "shadowpay", label: "ShadowPay", quoteKey: "shadowpay" },
        { id: "waxpeer", label: "Waxpeer", quoteKey: "waxpeer" },
        { id: "mannco", label: "Mannco.store", quoteKey: "mannco" },
        { id: "haloskins", label: "HaloSkins", quoteKey: "haloskins" },
        { id: "rapidskins", label: "RapidSkins", quoteKey: "rapidskins" }
      ];
      const compareWear = selectedInspectWear || DEFAULT_WEAR;
      const compareBaseName = dynamicQuoteBaseName || ITEM_DETAILS.title;
      const steamCompareQuote = resolveMarketplaceCompareQuote(
        dynamicMarketQuotes,
        "steam",
        compareBaseName,
        compareWear,
        HAS_WEAR_VARIANTS
      );
      const steamQualityRow = Array.isArray(qualityRows) ? qualityRows.find((row) => String(row?.wear || "").trim() === String(compareWear).trim()) : null;
      const steamAsk = positivePrice(steamCompareQuote?.price) || positivePrice(steamQualityRow?.priceGross) || positivePrice(parseNumericDisplay(steamQualityRow?.price)) || 0;
      const marketplaceCompareRows = COMPARE_MARKET_TABS.map(function(tab) {
        const quote = resolveMarketplaceCompareQuote(
          dynamicMarketQuotes,
          tab.quoteKey,
          compareBaseName,
          compareWear,
          HAS_WEAR_VARIANTS
        );
        const dist = distEntries.find(function(entry) {
          return String(entry.marketplace || "").toLowerCase().replace(/[^a-z0-9]+/g, "_") === tab.id || String(entry.marketplace || "").toLowerCase() === tab.label.toLowerCase();
        });
        const marketRow = (marketRowsData || []).find(function(row) {
          return String(row.name || "").toLowerCase().includes(tab.label.toLowerCase().split(".")[0].toLowerCase()) || String(row.name || "").toLowerCase() === tab.label.toLowerCase() || tab.id === "steam" && /steam/i.test(String(row.name || ""));
        });
        const bundlePrice = HAS_WEAR_VARIANTS ? positivePrice(bundleSourcePrice(effectiveAnalyticsBundle, tab.quoteKey, compareWear, compareBaseName)) : null;
        let ask = positivePrice(quote?.price) || (tab.id === "steam" ? steamAsk : 0) || bundlePrice || positivePrice(parseNumericDisplay(marketRow?.finalPrice)) || 0;
        if (HAS_WEAR_VARIANTS && tab.id !== "steam" && steamAsk > 0 && ask > 0 && (ask / steamAsk > 3.2 || ask / steamAsk < 0.28)) {
          ask = positivePrice(quote?.price) && quoteMatchesSelectedWear(quote, compareWear) ? positivePrice(quote.price) : 0;
        }
        const quoteFee = Number(quote?.fee_pct ?? quote?.fee ?? NaN);
        const feePct = (Number.isFinite(quoteFee) && quoteFee >= 0 ? quoteFee : 0) || marketplaceListingFeePct(tab.label) || marketplaceListingFeePct(tab.id) || (tab.id === "steam" ? 15 : 0);
        let net = ask;
        let cut = 0;
        if (ask > 0 && feePct > 0) {
          if (tab.id === "steam") {
            net = ask / 1.15;
            cut = ask - net;
          } else {
            cut = ask * (feePct / 100);
            net = ask - cut;
          }
        }
        const listings = Math.max(
          0,
          Number(
            (quoteMatchesSelectedWear(quote, compareWear) ? quote?.listings : 0) || (tab.id === "steam" ? steamCompareQuote?.listings : 0) || 0
          ) || 0
        );
        const vsSteam = tab.id === "steam" || !(steamAsk > 0 && ask > 0) ? null : (ask - steamAsk) / steamAsk * 100;
        const rawMarketUrl = quote?.market_url || marketRow?.market_url || "";
        const marketUrl = tab.id === "skinport" ? normalizeMarketplaceUrl("skinport", rawMarketUrl, compareBaseName, compareWear) : rawMarketUrl || buildMarketplaceFallbackUrl(tab.id, compareBaseName, compareWear);
        return {
          id: tab.id,
          label: tab.label,
          ask,
          feePct,
          feeCut: cut,
          net,
          listings,
          vsSteam,
          market_url: marketUrl,
          hasData: ask > 0 || listings > 0
        };
      });
      const activeCompareRow = marketplaceCompareRows.find(function(row) {
        return row.id === compareMarketTab;
      }) || marketplaceCompareRows[0];
      const cheapestCompare = marketplaceCompareRows.filter(function(row) {
        return row.ask > 0;
      }).slice().sort(function(a, b) {
        return a.ask - b.ask;
      })[0] || null;
      const socialItemId = trackedItemId || stableSocialItemId(effectiveMarketHashName || String(trackedItemId || 1));
      const socialIdentity = resolveSocialIdentity(steamSession, {
        author: socialAuthor,
        avatar: socialAvatar
      });
      function clearSocialImage() {
        if (socialImagePreview && String(socialImagePreview).startsWith("blob:")) {
          try {
            URL.revokeObjectURL(socialImagePreview);
          } catch (_e) {
          }
        }
        setSocialImageFile(null);
        setSocialImagePreview("");
        setSocialGiphyUrl("");
        if (socialImageInputRef.current) socialImageInputRef.current.value = "";
      }
      function pickSocialImage(file) {
        if (!file) return;
        if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
          setSocialError(t("social_errImageType"));
          return;
        }
        if (file.size > SOCIAL_IMAGE_MAX_BYTES) {
          setSocialError(t("social_errImageSize"));
          return;
        }
        setSocialError("");
        clearSocialImage();
        setSocialImageFile(file);
        setSocialGiphyUrl("");
        try {
          setSocialImagePreview(URL.createObjectURL(file));
        } catch (_e) {
          setSocialImagePreview("");
        }
      }
      function rememberGiphyFavourite(gif) {
        if (!gif || !gif.id || !gif.url) return;
        setGiphyFavs(function(prev) {
          const next = [gif].concat((prev || []).filter(function(row) {
            return row.id !== gif.id;
          })).slice(0, 48);
          saveGiphyFavourites(next);
          return next;
        });
      }
      function isGiphyFavourite(gifId) {
        const id = String(gifId || "").trim();
        if (!id) return false;
        return (giphyFavs || []).some(function(row) {
          return row && row.id === id;
        });
      }
      function toggleGiphyFavourite(gif, event) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        if (!gif || !gif.id || !gif.url) return;
        const id = String(gif.id);
        const wasFav = isGiphyFavourite(id);
        setGiphyFavs(function(prev) {
          const list = prev || [];
          const next = wasFav ? list.filter(function(row) {
            return row && row.id !== id;
          }) : [gif].concat(list.filter(function(row) {
            return row && row.id !== id;
          })).slice(0, 48);
          saveGiphyFavourites(next);
          return next;
        });
        if (wasFav && giphyView === "results" && giphyHeading?.kind === "favourites") {
          setGiphyResults(function(prev) {
            return (prev || []).filter(function(row) {
              return row && row.id !== id;
            });
          });
        }
      }
      async function fetchGiphyCategoryPreviewUrl(cat) {
        if (!cat) return "";
        if (cat.kind === "favourites") return "";
        try {
          const endpoint = cat.kind === "trending" ? "giphy_trending.php?limit=1" : "giphy_search.php?q=" + encodeURIComponent(cat.q || cat.label || "") + "&limit=1";
          const response = await fetch(endpoint, { credentials: "same-origin" });
          if (!response.ok) return "";
          const json = await response.json();
          if (!json?.success || !Array.isArray(json.gifs) || !json.gifs.length) return "";
          const gif = json.gifs[0];
          const url = String(gif?.url || gif?.preview || "").trim();
          return /^https:\/\//i.test(url) ? url : "";
        } catch (_e) {
          return "";
        }
      }
      async function ensureGiphyCategoryPreviews() {
        if (giphyCatPreviewInflightRef.current) return;
        giphyCatPreviewInflightRef.current = true;
        try {
          const current = Object.assign({}, giphyCatPreviewsRef.current || {});
          delete current.favourites;
          Object.keys(current).forEach(function(key) {
            const url = String(current[key] || "").trim();
            if (!url || !/^https:\/\//i.test(url)) delete current[key];
          });
          const missing = GIPHY_CATEGORIES.filter(function(cat) {
            if (cat.kind === "favourites") return false;
            return !current[cat.id];
          });
          if (!missing.length) {
            giphyCatPreviewsRef.current = current;
            setGiphyCatPreviews(current);
            saveCachedGiphyCategoryPreviews(current);
            return;
          }
          const chunkSize = 6;
          for (let i = 0; i < missing.length; i += chunkSize) {
            const chunk = missing.slice(i, i + chunkSize);
            const urls = await Promise.all(chunk.map(function(cat) {
              return fetchGiphyCategoryPreviewUrl(cat);
            }));
            chunk.forEach(function(cat, idx) {
              const url = String(urls[idx] || "").trim();
              if (url) current[cat.id] = url;
            });
            giphyCatPreviewsRef.current = Object.assign({}, current);
            setGiphyCatPreviews(Object.assign({}, current));
          }
          saveCachedGiphyCategoryPreviews(current);
        } finally {
          giphyCatPreviewInflightRef.current = false;
        }
      }
      function closeGiphyPicker() {
        if (giphySearchTimerRef.current) {
          clearTimeout(giphySearchTimerRef.current);
          giphySearchTimerRef.current = null;
        }
        giphySearchSeqRef.current += 1;
        giphyTypedQueryRef.current = false;
        setGiphyOpen(false);
        setGiphyError("");
        setGiphyLoading(false);
      }
      function openGiphyPicker() {
        if (giphySearchTimerRef.current) {
          clearTimeout(giphySearchTimerRef.current);
          giphySearchTimerRef.current = null;
        }
        giphyTypedQueryRef.current = false;
        setGiphyOpen(true);
        setGiphyQuery("");
        setGiphyView("categories");
        setGiphyHeading({ kind: "categories", query: "" });
        setGiphyResults([]);
        setGiphyError("");
        setGiphyLoading(false);
      }
      function applySocialIdeaDraft(draft) {
        const next = normalizeSocialIdeaDraft(draft);
        if (!next) return;
        setSocialText(next.text);
        setSocialSentiment(next.sentiment);
        setSocialTarget(next.target);
        setSocialGiphyUrl(next.giphyUrl);
        if (next.giphyUrl) {
          if (socialImagePreview && String(socialImagePreview).startsWith("blob:")) {
            try {
              URL.revokeObjectURL(socialImagePreview);
            } catch (_e) {
            }
          }
          setSocialImageFile(null);
          if (socialImageInputRef.current) socialImageInputRef.current.value = "";
          setSocialImagePreview(next.giphyUrl);
        }
      }
      function collectSocialComposerDraft(publishAfterLogin) {
        const existing = loadSocialIdeaDraft(trackedItemId, effectiveMarketHashName);
        return {
          text: String(socialText || ""),
          sentiment: socialSentiment === "bullish" || socialSentiment === "bearish" ? socialSentiment : null,
          target: String(socialTarget || ""),
          giphyUrl: String(socialGiphyUrl || ""),
          publishAfterLogin: publishAfterLogin === true || Boolean(existing?.publishAfterLogin),
          savedAt: Date.now()
        };
      }
      function saveSocialComposerDraft(publishAfterLogin) {
        const draft = collectSocialComposerDraft(publishAfterLogin);
        if (!socialIdeaDraftHasContent(draft) && !draft.publishAfterLogin) {
          clearSocialIdeaDraft(trackedItemId, effectiveMarketHashName);
          return draft;
        }
        persistSocialIdeaDraft(trackedItemId, effectiveMarketHashName, draft);
        return draft;
      }
      async function loadGiphyResults(mode, query) {
        const seq = ++giphySearchSeqRef.current;
        setGiphyLoading(true);
        setGiphyError("");
        setGiphyView("results");
        try {
          if (mode === "favourites") {
            if (seq !== giphySearchSeqRef.current) return;
            setGiphyHeading({ kind: "favourites", query: "" });
            setGiphyResults(giphyFavs.slice());
            setGiphyLoading(false);
            return;
          }
          const endpoint = mode === "trending" ? "giphy_trending.php?limit=24" : "giphy_search.php?q=" + encodeURIComponent(query || "") + "&limit=24";
          setGiphyHeading(mode === "trending" ? { kind: "trending", query: "" } : { kind: "search", query: String(query || "") });
          const response = await fetch(endpoint, { credentials: "same-origin" });
          const json = await response.json();
          if (seq !== giphySearchSeqRef.current) return;
          if (!json?.success) {
            setGiphyResults([]);
            setGiphyError(json?.error || "Could not load GIFs.");
            setGiphyLoading(false);
            return;
          }
          setGiphyResults(Array.isArray(json.gifs) ? json.gifs : []);
          setGiphyLoading(false);
        } catch (_e) {
          if (seq !== giphySearchSeqRef.current) return;
          setGiphyResults([]);
          setGiphyError(t("giphy_errLoad"));
          setGiphyLoading(false);
        }
      }
      useEffect(function() {
        if (!giphyOpen) return void 0;
        ensureGiphyCategoryPreviews();
        return void 0;
      }, [giphyOpen]);
      useEffect(function() {
        if (!giphyOpen) return void 0;
        const q = String(giphyQuery || "").trim();
        if (giphySearchTimerRef.current) {
          clearTimeout(giphySearchTimerRef.current);
          giphySearchTimerRef.current = null;
        }
        if (!q) {
          if (giphyTypedQueryRef.current) {
            giphyTypedQueryRef.current = false;
            giphySearchSeqRef.current += 1;
            setGiphyView("categories");
            setGiphyHeading({ kind: "categories", query: "" });
            setGiphyResults([]);
            setGiphyError("");
            setGiphyLoading(false);
          }
          return void 0;
        }
        giphyTypedQueryRef.current = true;
        setGiphyLoading(true);
        setGiphyView("results");
        setGiphyError("");
        giphySearchTimerRef.current = setTimeout(function() {
          giphySearchTimerRef.current = null;
          loadGiphyResults("search", q);
        }, GIPHY_LIVE_SEARCH_MS);
        return function() {
          if (giphySearchTimerRef.current) {
            clearTimeout(giphySearchTimerRef.current);
            giphySearchTimerRef.current = null;
          }
        };
      }, [giphyQuery, giphyOpen]);
      function pickSocialGiphy(gif) {
        const url = String(gif?.url || "").trim();
        const preview = String(gif?.preview || url).trim();
        if (!url) {
          setGiphyError(t("giphy_errAttach"));
          return;
        }
        setSocialError("");
        if (socialImagePreview && String(socialImagePreview).startsWith("blob:")) {
          try {
            URL.revokeObjectURL(socialImagePreview);
          } catch (_e) {
          }
        }
        setSocialImageFile(null);
        if (socialImageInputRef.current) socialImageInputRef.current.value = "";
        setSocialGiphyUrl(url);
        setSocialImagePreview(preview || url);
        closeGiphyPicker();
      }
      function resetSocialComposer() {
        setSocialText("");
        setSocialSentiment(null);
        setSocialTarget("");
        clearSocialImage();
        clearSocialIdeaDraft(trackedItemId, effectiveMarketHashName);
      }
      async function publishSocialIdeaFromDraft(draft, identity) {
        const text = String(draft?.text || "").trim();
        const giphyUrl = String(draft?.giphyUrl || "").trim();
        const sentiment = draft?.sentiment === "bullish" || draft?.sentiment === "bearish" ? draft.sentiment : null;
        const target = String(draft?.target || "").trim();
        const publishBody = text || (giphyUrl ? " " : "");
        if (!publishBody || socialSubmitting) return false;
        if (!trackedItemId) {
          setSocialError(t("social_errPublishPost"));
          return false;
        }
        const authorIdentity = identity || socialIdentity;
        setSocialSubmitting(true);
        setSocialError("");
        saveSocialProfile({
          author: authorIdentity.author,
          avatar: authorIdentity.avatar
        });
        try {
          const payload = socialImageFile && !giphyUrl ? function() {
            const form = new FormData();
            form.append("item_id", String(trackedItemId));
            form.append("body", publishBody);
            if (sentiment) form.append("sentiment", sentiment);
            if (target !== "") form.append("target_price", String(Number(target)));
            form.append("image", socialImageFile);
            return form;
          }() : JSON.stringify({
            item_id: trackedItemId,
            body: publishBody,
            sentiment,
            target_price: target !== "" ? Number(target) : null,
            giphy_url: giphyUrl || null
          });
          const response = await fetch("save_social_post.php", {
            method: "POST",
            credentials: "same-origin",
            headers: socialImageFile && !giphyUrl ? void 0 : { "Content-Type": "application/json" },
            body: payload
          });
          const json = await response.json();
          if (response.status === 401 || json?.error?.toLowerCase?.().includes("not logged in")) {
            persistSocialIdeaDraft(trackedItemId, effectiveMarketHashName, Object.assign({}, draft, {
              publishAfterLogin: true,
              savedAt: Date.now()
            }));
            setSocialError("");
            setSocialSubmitting(false);
            promptSocialLogin();
            return false;
          }
          if (json?.success && json.post) {
            const nextPost = formatSocialPostFromApi(json.post);
            setSocialPosts(function(prev) {
              return [nextPost].concat(prev);
            });
            resetSocialComposer();
            setSocialSubmitting(false);
            return true;
          }
          setSocialError(json?.error || "Could not publish this post.");
          setSocialSubmitting(false);
          return false;
        } catch (_error) {
          setSocialError(t("social_errPublishPost"));
          setSocialSubmitting(false);
          return false;
        }
      }
      async function handleSocialSubmit() {
        const draft = saveSocialComposerDraft(!socialIdentity.isLoggedIn);
        if (!socialIdeaDraftHasContent(draft) && !String(draft.giphyUrl || "").trim() && !String(draft.text || "").trim()) {
          return;
        }
        if (!String(draft.text || "").trim() && !String(draft.giphyUrl || "").trim()) {
          setSocialError(t("social_errWriteSomething"));
          return;
        }
        if (socialSubmitting) return;
        if (!socialIdentity.isLoggedIn) {
          persistSocialIdeaDraft(trackedItemId, effectiveMarketHashName, Object.assign({}, draft, {
            publishAfterLogin: true,
            savedAt: Date.now()
          }));
          promptSocialLogin();
          return;
        }
        await publishSocialIdeaFromDraft(draft, socialIdentity);
      }
      useEffect(function() {
        if (!socialDraftPersistReadyRef.current) {
          socialDraftPersistReadyRef.current = true;
          return void 0;
        }
        saveSocialComposerDraft(false);
        return void 0;
      }, [socialText, socialSentiment, socialTarget, socialGiphyUrl, trackedItemId, effectiveMarketHashName]);
      useEffect(function() {
        if (ITEM_PAGE_AUTH_FLAG !== "success") return void 0;
        if (!socialIdentity.isLoggedIn || socialSubmitting) return void 0;
        if (!itemLookupResolved || !trackedItemId) return void 0;
        if (socialAutoPublishRef.current) return void 0;
        const draft = loadSocialIdeaDraft(trackedItemId, effectiveMarketHashName);
        if (!draft || !draft.publishAfterLogin) return void 0;
        if (!String(draft.text || "").trim() && !String(draft.giphyUrl || "").trim()) return void 0;
        socialAutoPublishRef.current = true;
        applySocialIdeaDraft(draft);
        publishSocialIdeaFromDraft(draft, socialIdentity);
        return void 0;
      }, [socialIdentity.isLoggedIn, itemLookupResolved, trackedItemId, effectiveMarketHashName, steamSession]);
      async function handleSocialCommentSubmit(post) {
        const postId = String(post?.id || "");
        if (!postId || postId.startsWith("local-") || commentBusyId) return;
        const body = String(commentDrafts[postId] || "").trim();
        if (!body) return;
        if (!socialIdentity.isLoggedIn) {
          setSocialError(t("social_signInToComment"));
          return;
        }
        setCommentBusyId(postId);
        setSocialError("");
        try {
          const imageFile = commentImages[postId] || null;
          const payload = imageFile ? function() {
            const form = new FormData();
            form.append("post_id", postId);
            form.append("body", body);
            form.append("image", imageFile);
            return form;
          }() : JSON.stringify({ post_id: Number(postId), body });
          const response = await fetch("save_social_comment.php", {
            method: "POST",
            credentials: "same-origin",
            headers: imageFile ? void 0 : { "Content-Type": "application/json" },
            body: payload
          });
          const json = await response.json();
          if (response.status === 401 || json?.error?.toLowerCase?.().includes("not logged in")) {
            setSocialError(t("social_signInToComment"));
            return;
          }
          if (!json?.success || !json.comment) {
            setSocialError(json?.error || "Could not publish this comment.");
            return;
          }
          const nextComment = formatSocialCommentFromApi(json.comment);
          setSocialPosts(function(prev) {
            return prev.map(function(entry) {
              if (String(entry.id) !== postId) return entry;
              const comments = Array.isArray(entry.comments) ? entry.comments.concat([nextComment]) : [nextComment];
              return Object.assign({}, entry, { comments });
            });
          });
          setCommentDrafts(function(prev) {
            return Object.assign({}, prev, { [postId]: "" });
          });
          const preview = commentPreviews[postId];
          if (preview && String(preview).startsWith("blob:")) {
            try {
              URL.revokeObjectURL(preview);
            } catch (_e) {
            }
          }
          setCommentImages(function(prev) {
            const next = Object.assign({}, prev);
            delete next[postId];
            return next;
          });
          setCommentPreviews(function(prev) {
            const next = Object.assign({}, prev);
            delete next[postId];
            return next;
          });
        } catch (_error) {
          setSocialError(t("social_errPublishComment"));
        } finally {
          setCommentBusyId("");
        }
      }
      function handleSocialReaction(postId, reaction) {
        const id = String(postId);
        const previousReaction = socialReactions[id] || "";
        const nextReaction = previousReaction === reaction ? "" : reaction;
        setSocialReactions(function(prev) {
          const updated = Object.assign({}, prev, { [id]: nextReaction });
          persistSocialReactions(socialItemId, updated);
          return updated;
        });
        setSocialPosts(function(prev) {
          return prev.map(function(post) {
            if (String(post.id) !== id) return post;
            let likes = Number(post.likes || 0);
            let dislikes = Number(post.dislikes || 0);
            if (previousReaction === "like") likes -= 1;
            if (previousReaction === "dislike") dislikes -= 1;
            if (nextReaction === "like") likes += 1;
            if (nextReaction === "dislike") dislikes += 1;
            const updated = Object.assign({}, post, {
              likes: Math.max(0, likes),
              dislikes: Math.max(0, dislikes)
            });
            persistSocialReactionCounts(socialItemId, id, updated.likes, updated.dislikes);
            if (String(id).startsWith("local-")) {
              updateStoredSocialPost(socialItemId, updated);
            }
            return updated;
          });
        });
      }
      function handleSocialEditCancel() {
        setEditingPostId(null);
        setEditingDraft({ body: "", sentiment: null, target: "" });
      }
      function handleSocialEditStart(post) {
        setEditingPostId(String(post.id));
        setEditingDraft({
          body: String(post.body || ""),
          sentiment: post.sentiment || null,
          target: post.target != null && Number.isFinite(Number(post.target)) ? String(post.target) : ""
        });
      }
      async function handleSocialEditSave(post) {
        const id = String(post.id);
        const body = String(editingDraft.body || "").trim();
        if (!body || socialActionId) return;
        const sentiment = editingDraft.sentiment || null;
        const target = editingDraft.target !== "" ? Number(editingDraft.target) : null;
        setSocialActionId(id);
        try {
          if (id.startsWith("local-")) {
            const updated2 = Object.assign({}, post, {
              body,
              sentiment,
              target: Number.isFinite(target) ? target : null
            });
            updateStoredSocialPost(socialItemId, updated2);
            setSocialPosts(function(prev) {
              return prev.map(function(entry) {
                return String(entry.id) === id ? updated2 : entry;
              });
            });
            handleSocialEditCancel();
            return;
          }
          if (!socialIdentity.isLoggedIn) {
            window.alert("Sign in with Steam to edit this post.");
            return;
          }
          const response = await fetch("manage_social_post.php", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update",
              post_id: Number(post.id),
              body,
              sentiment,
              target_price: Number.isFinite(target) ? target : null
            })
          });
          const json = await response.json();
          if (!json?.success || !json.post) {
            setSocialError(json?.error || "Could not update post.");
            window.alert(json?.error || "Could not update post.");
            return;
          }
          const updated = formatSocialPostFromApi(json.post);
          setSocialPosts(function(prev) {
            return prev.map(function(entry) {
              return String(entry.id) === id ? updated : entry;
            });
          });
          handleSocialEditCancel();
        } catch (_error) {
          window.alert("Could not update post.");
        } finally {
          setSocialActionId("");
        }
      }
      async function handleSocialDelete(post) {
        const id = String(post.id);
        if (socialActionId) return;
        setSocialActionId(id);
        try {
          if (id.startsWith("local-")) {
            removeStoredSocialPost(socialItemId, id);
          } else {
            if (!socialIdentity.isLoggedIn) {
              window.alert("Sign in with Steam to delete this post.");
              return;
            }
            const response = await fetch("manage_social_post.php", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "delete",
                post_id: Number(post.id)
              })
            });
            const json = await response.json();
            if (!json?.success) {
              window.alert(json?.error || "Could not delete post.");
              return;
            }
          }
          setSocialPosts(function(prev) {
            return prev.filter(function(entry) {
              return String(entry.id) !== id;
            });
          });
          if (editingPostId === id) handleSocialEditCancel();
        } catch (_error) {
          window.alert("Could not delete post.");
        } finally {
          setSocialActionId("");
        }
      }
      const visibleSocialPosts = socialFeedExpanded || socialPosts.length < SOCIAL_FEED_VISIBLE ? socialPosts : socialPosts.slice(0, SOCIAL_FEED_VISIBLE);
      const hiddenSocialCount = Math.max(0, socialPosts.length - SOCIAL_FEED_VISIBLE);
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "tv-page" }, /* @__PURE__ */ React.createElement("div", { className: "tv-header-bar" }, /* @__PURE__ */ React.createElement("div", { className: "tv-header-identity" }, /* @__PURE__ */ React.createElement("div", { className: "tv-header-collection" }, ITEM_DETAILS.collectionImage ? /* @__PURE__ */ React.createElement("img", { src: ITEM_DETAILS.collectionImage, alt: "" }) : null, /* @__PURE__ */ React.createElement("span", null, headerCollectionLabel)), /* @__PURE__ */ React.createElement("h1", { className: "tv-header-title" }, ITEM_DETAILS.title)), /* @__PURE__ */ React.createElement("div", { className: "tv-header-actions" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "tv-hdr-btn" + (watchlist.some(function(w) {
            return w.key === trackedItemId + ":" + selectedInspectWear;
          }) ? " active" : ""),
          onClick: function() {
            if (!isAuthenticated) {
              promptSocialLogin();
              return;
            }
            var key = trackedItemId + ":" + selectedInspectWear;
            setWatchlist(function(prev) {
              var exists = prev.some(function(w) {
                return w.key === key;
              });
              var next = exists ? prev.filter(function(w) {
                return w.key !== key;
              }) : prev.concat([{
                key,
                title: ITEM_DETAILS.title,
                wear: selectedInspectWear,
                addedAt: Date.now(),
                itemId: trackedItemId,
                image: ITEM_DETAILS.image || "",
                href: window.location.href,
                marketHashName: QUERY_MARKET_HASH_NAME || QUERY_DISPLAY_NAME || ITEM_DETAILS.title
              }]);
              try {
                localStorage.setItem("cs2_watchlist", JSON.stringify(next));
              } catch (x) {
              }
              return next;
            });
          }
        },
        (() => {
          const onWatchlist = watchlist.some(function(w) {
            return w.key === trackedItemId + ":" + selectedInspectWear;
          });
          return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("i", { className: onWatchlist ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark" }), onWatchlist ? t("item_added") : t("item_watchlist"));
        })()
      ), canSimulateContainer ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "tv-hdr-btn", onClick: openCaseSimulation }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-box-open" }), " ", containerSimulationLabel(ITEM_DETAILS.title, visualType, t)) : null, canToggle3DViewer ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "tv-hdr-btn" + (isViewerActive ? " active" : ""),
          onClick: toggle3DViewer,
          title: isViewerActive ? t("item_switchTo2D") : t("item_viewSkinIn3D")
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-cube" }),
        isViewerActive ? t("item_2dView") : t("item_viewIn3D")
      ) : null, canCustomizeSkin ? /* @__PURE__ */ React.createElement(
        "a",
        {
          className: "tv-hdr-btn",
          href: buildSkinCrafterUrl(
            inspectBaseName || ITEM_DETAILS.title,
            HAS_WEAR_VARIANTS ? selectedInspectWear || DEFAULT_WEAR : ""
          ),
          title: t("item_openInSkinCrafter")
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-paintbrush" }),
        t("item_customize")
      ) : null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "tv-hdr-btn", onClick: handlePriceAlertClick }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-bell" }), " ", t("item_priceAlert")), showInspectInGameButton ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "tv-hdr-btn" + (inspectButtonBusy ? " dim" : ""),
          onClick: function() {
            openInspectTarget(inspectLaunchWear);
          },
          disabled: inspectButtonBusy || !canInspectInGame,
          title: canInspectInGame ? canGenerateSkinInspect || hasExactInspectInGame ? HAS_WEAR_VARIANTS ? t("item_openWearInCS2") : t("item_inspectInCS2") : t("item_openNearestWear", { wear: activeInspectButtonShort }) : t("item_noLiveInspect")
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-crosshairs" }),
        inspectButtonBusy ? t("item_loading") : t("item_viewInGame")
      ) : null, /* @__PURE__ */ React.createElement("button", { type: "button", className: "tv-hdr-btn", onClick: function() {
        setShowShareModal(true);
      } }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-share-nodes" }), " ", t("item_share")), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "tv-hdr-btn",
          "data-mark-item-analysis": true,
          onClick: function(event) {
            if (event && event.preventDefault) event.preventDefault();
            if (event && event.stopPropagation) event.stopPropagation();
            var itemName = String(ITEM_DETAILS && ITEM_DETAILS.title || QUERY_DISPLAY_NAME || QUERY_MARKET_HASH_NAME || "this item").trim();
            var marketHashName = String(QUERY_MARKET_HASH_NAME || QUERY_LOOKUP_NAME || itemName).trim();
            var detail = {
              itemName,
              wear: selectedInspectWear || "",
              marketHashName
            };
            if (window.CS2React && typeof window.CS2React.requestItemAnalysis === "function") {
              window.CS2React.requestItemAnalysis(detail);
              return;
            }
            try {
              if (window.CS2React && typeof window.CS2React.ensureChatWidget === "function") {
                window.CS2React.ensureChatWidget();
              }
            } catch (_err) {
            }
            window.__CS2_PENDING_ITEM_ANALYSIS__ = detail;
            window.dispatchEvent(new CustomEvent("cs2:mark-item-analysis", { detail }));
          }
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-robot" }),
        " ",
        t("item_aiAnalysis")
      ))), /* @__PURE__ */ React.createElement("div", { className: "tv-hero" }, /* @__PURE__ */ React.createElement("div", { className: "tv-skin-panel" }, /* @__PURE__ */ React.createElement("div", { className: "tv-skin-viewer-wrap type-" + visualType + (isViewerActive ? " is-3d-active" : ""), style: skinViewerStyle }, /* @__PURE__ */ React.createElement(
        "img",
        {
          className: "tv-skin-img" + (hideXm1014Shell ? " xm-hide-shell" : ""),
          src: activeWeaponImage,
          alt: ITEM_DETAILS.title,
          style: {
            opacity: isViewerActive ? 0 : 1,
            pointerEvents: isViewerActive ? "none" : "auto",
            transition: "opacity 0.2s"
          }
        }
      ), /* @__PURE__ */ React.createElement(
        "div",
        {
          id: "weaponViewer3D",
          className: "tv-3d-container" + (isViewerActive ? " active" : ""),
          ref: viewerContainerRef
        }
      )), HAS_WEAR_VARIANTS && /* @__PURE__ */ React.createElement("div", { className: "tv-quality-table tv-quality-table--tabbed" + (showStatTrakWearColumn ? "" : " tv-quality-table--no-st") + (showSouvenirWearColumn ? "" : " tv-quality-table--no-sv") }, /* @__PURE__ */ React.createElement("div", { className: "tv-quality-hdr" }, /* @__PURE__ */ React.createElement("span", null, "Wear"), /* @__PURE__ */ React.createElement("span", { className: "tv-qr-market source-" + activeWearTableSource.id }, activeWearTableSource.short), showStatTrakWearColumn ? /* @__PURE__ */ React.createElement("span", { className: "st-col" }, "ST") : null, showSouvenirWearColumn ? /* @__PURE__ */ React.createElement("span", { className: "sv-col" }, "SV") : null), multiMarketWearRows.map(function(row) {
        const market = row.markets?.[wearTableSource] || { price: "—", market_url: "" };
        return /* @__PURE__ */ React.createElement(
          "div",
          {
            key: wearTableSource + "-" + row.wear,
            className: "tv-quality-row tv-quality-row--tabbed" + (selectedInspectWear === row.wear ? " active" : "")
          },
          /* @__PURE__ */ React.createElement(
            "button",
            {
              type: "button",
              className: "tv-qr-wear-btn",
              onClick: function(e) {
                selectWearPreview(e, row.wear);
              }
            },
            row.wear
          ),
          /* @__PURE__ */ React.createElement(
            "button",
            {
              type: "button",
              className: "tv-qr-market-price source-" + wearTableSource + (market.price === "—" ? " is-empty" : ""),
              title: "Open " + activeWearTableSource.label + " listing",
              onClick: function() {
                openProviderListing(row.wear, wearTableSource, market.market_url);
              }
            },
            market.price
          ),
          showStatTrakWearColumn ? /* @__PURE__ */ React.createElement("span", { className: "tv-qr-st" }, row.stattrak) : null,
          showSouvenirWearColumn ? /* @__PURE__ */ React.createElement("span", { className: "tv-qr-sv" }, row.souvenir) : null
        );
      })), /* @__PURE__ */ React.createElement("div", { className: "tv-skin-ctas" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "tv-cta market-source source-steam", onClick: function() {
        openMarketplaceListing(selectedInspectWear);
      } }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-up-right-from-square" }), " ", t("item_viewOn", { market: activeMarketLabel }), HAS_WEAR_VARIANTS ? " (" + activeInspectShort + ")" : "")), /* @__PURE__ */ React.createElement("div", { className: "tv-skin-meta" }, !isCaseItemView && visualType !== "charms" && itemDescriptionText ? /* @__PURE__ */ React.createElement("p", { className: "tv-skin-desc" }, itemDescriptionText) : null, isCaseItemView && caseDescription ? /* @__PURE__ */ React.createElement("p", { className: "tv-skin-desc" }, caseDescription) : null, showItemOriginMeta && displaySkinOriginName ? /* @__PURE__ */ React.createElement("div", { className: "tv-meta-row" }, /* @__PURE__ */ React.createElement("span", { className: "tv-meta-label" }, displayOriginMetaLabel), /* @__PURE__ */ React.createElement("span", { className: "tv-meta-val" }, displaySkinOriginName)) : displayTypeLabel ? /* @__PURE__ */ React.createElement("div", { className: "tv-meta-row" }, /* @__PURE__ */ React.createElement("span", { className: "tv-meta-label" }, t("item_type")), /* @__PURE__ */ React.createElement("span", { className: "tv-meta-val" }, displayTypeLabel)) : null, releaseDateLabel ? /* @__PURE__ */ React.createElement("div", { className: "tv-meta-row" }, /* @__PURE__ */ React.createElement("span", { className: "tv-meta-label" }, t("item_released")), /* @__PURE__ */ React.createElement("span", { className: "tv-meta-val" }, releaseDateLabel)) : null)), /* @__PURE__ */ React.createElement("div", { className: classNames("tv-chart-slot", isMainChartFullscreen && "is-fs-parked"), ref: chartSlotRef }, /* @__PURE__ */ React.createElement("div", { className: classNames("tv-chart-panel tv-chart-panel--steam", isMainChartFullscreen && "is-native-fullscreen"), ref: bindFullscreenRef("main-chart") }, /* @__PURE__ */ React.createElement("div", { className: "tv-chart-hdr" }, /* @__PURE__ */ React.createElement("div", { className: "tv-chart-price-block" }, /* @__PURE__ */ React.createElement("div", { className: "tv-chart-price" }, hasAnalyticsChartPrice ? formatPrice(analyticsChartPrice) : "—"), /* @__PURE__ */ React.createElement("div", { className: "tv-chart-delta " + toneClass(analyticsDelta) }, analyticsDelta >= 0 ? "+" : "", analyticsDelta.toFixed(2), "%", /* @__PURE__ */ React.createElement("span", { className: "tv-chart-range-label" }, "(", priceRange, ")"))), /* @__PURE__ */ React.createElement("div", { className: "tv-trend-badges" }, analyticsBadges.map(function(b) {
        return /* @__PURE__ */ React.createElement("span", { key: b.label, className: "tv-trend-badge " + toneClass(b.value) }, /* @__PURE__ */ React.createElement("span", { className: "tv-tbadge-label" }, b.label), b.value >= 0 ? "+" : "", b.value.toFixed(2), "%");
      }))), /* @__PURE__ */ React.createElement("div", { className: "tv-toolbar" }, /* @__PURE__ */ React.createElement("div", { className: "tv-toolbar-group tv-toolbar-group--sources" }, toolbarSourceOptions.map(function(opt) {
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: opt.id,
            type: "button",
            className: "tv-tb-btn source-" + opt.id + (effectivePriceSource === opt.id ? " active" : ""),
            onClick: function() {
              setPriceSource(opt.id);
            }
          },
          opt.label
        );
      })), /* @__PURE__ */ React.createElement("div", { className: "tv-toolbar-sep" }), /* @__PURE__ */ React.createElement("div", { className: "tv-toolbar-group-range" }, /* @__PURE__ */ React.createElement("div", { className: "tv-toolbar-group" }, ["7D", "1M", "3M", "6M", "1Y", "ALL"].map(function(r) {
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: r,
            type: "button",
            className: "tv-tb-btn" + (priceRange === r ? " active" : ""),
            onClick: function() {
              setPriceRange(r);
            }
          },
          r === "ALL" ? "Max" : r
        );
      })), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "tv-fullscreen-btn" + (fullscreenTarget === "main-chart" ? " active" : ""),
          onClick: function() {
            toggleFullscreen("main-chart");
          },
          title: "Toggle fullscreen"
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid " + (fullscreenTarget === "main-chart" ? "fa-compress" : "fa-expand") })
      ))), analyticsNote && /* @__PURE__ */ React.createElement("div", { className: "tv-chart-note" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-info" }), " ", analyticsNote), HAS_WEAR_VARIANTS && (effectivePriceSource === "steam" || effectivePriceSource === "all") ? /* @__PURE__ */ React.createElement("div", { className: "tv-wear-legend", role: "group", "aria-label": t("chart_wearLegend") }, INSPECT_WEAR_OPTIONS.map(function(option) {
        const isSelected = option.wear === selectedInspectWear;
        const hasData = isSelected || (wearHistories[option.wear] || []).length >= 2;
        const hidden = !isSelected && Boolean(hiddenWearSeries[option.wear]);
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: "legend-" + option.wear,
            type: "button",
            className: classNames(
              "tv-wear-legend-item",
              isSelected && "is-primary",
              (hidden || !hasData) && "is-off"
            ),
            disabled: !hasData,
            title: option.label,
            onClick: function() {
              if (isSelected) return;
              setHiddenWearSeries(function(prev) {
                const next = Object.assign({}, prev);
                if (next[option.wear]) delete next[option.wear];
                else next[option.wear] = true;
                return next;
              });
            }
          },
          /* @__PURE__ */ React.createElement(
            "span",
            {
              className: "tv-wear-legend-swatch",
              style: { background: WEAR_SERIES_COLORS[option.wear] || "#64748b" },
              "aria-hidden": "true"
            }
          ),
          option.short
        );
      })) : null, /* @__PURE__ */ React.createElement("div", { className: classNames("tv-lw-stage", isMainChartFullscreen && "is-drawing-mode") }, /* @__PURE__ */ React.createElement(
        "aside",
        {
          className: "tv-draw-toolbar",
          "aria-label": "Chart drawing tools",
          "aria-hidden": !isMainChartFullscreen
        },
        chartDrawToolGroups.map(function(group, groupIndex) {
          const utilityGroup = Boolean(group.utility);
          return /* @__PURE__ */ React.createElement(
            "div",
            {
              key: `draw-group-${groupIndex}`,
              className: classNames("tv-draw-tool-group", utilityGroup && "tv-draw-tool-group--utility")
            },
            groupIndex > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tv-draw-tool-sep", "aria-hidden": "true" }) : null,
            (group.tools || []).map(function(toolId) {
              const tool = chartDrawToolLookup[toolId];
              if (!tool) return null;
              return /* @__PURE__ */ React.createElement(
                "button",
                {
                  key: tool.id,
                  type: "button",
                  "data-draw-tool": tool.id,
                  className: classNames(
                    "tv-draw-tool-btn",
                    tool.id === "cursor" && "is-primary",
                    drawTool === tool.id && tool.id !== "clear" && "active",
                    tool.id === "clear" && "is-danger"
                  ),
                  title: `${tool.word || tool.label}: ${tool.hint || tool.label}`,
                  "aria-label": `${tool.word || tool.label}. ${tool.hint || tool.label}`,
                  onClick: function() {
                    if (tool.id === "clear") {
                      drawToolsApiRef.current?.clearDrawings?.();
                      drawToolRef.current = "cursor";
                      setDrawTool("cursor");
                      return;
                    }
                    drawToolRef.current = tool.id;
                    setDrawTool(tool.id);
                    drawToolsApiRef.current?.updateOverlayPointer?.();
                  }
                },
                tool.fa ? /* @__PURE__ */ React.createElement("i", { className: classNames(tool.fa, "tv-draw-tool-icon", tool.faMod), "aria-hidden": "true" }) : tool.id === "clear" ? /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-trash-can tv-draw-tool-icon", "aria-hidden": "true" }) : /* @__PURE__ */ React.createElement(DrawToolIcon, { paths: tool.paths }),
                /* @__PURE__ */ React.createElement("span", { className: "tv-draw-tool-tip", role: "tooltip" }, /* @__PURE__ */ React.createElement("span", { className: "tv-draw-tool-tip-word" }, tool.word || tool.label), /* @__PURE__ */ React.createElement("span", { className: "tv-draw-tool-tip-hint" }, tool.hint || tool.label))
              );
            })
          );
        })
      ), /* @__PURE__ */ React.createElement("div", { className: "tv-lw-wrap tv-lw-wrap--steam" }, analyticsLoading && !isMainChartFullscreen && /* @__PURE__ */ React.createElement("div", { className: "tv-lw-loading" }, /* @__PURE__ */ React.createElement("div", { className: "tv-spinner" }), /* @__PURE__ */ React.createElement("span", null, "Loading market data...")), !analyticsLoading && !analyticsPoints.length && !isMainChartFullscreen && /* @__PURE__ */ React.createElement("div", { className: "tv-lw-loading" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chart-line" }), /* @__PURE__ */ React.createElement("span", null, MARKET_INTEGRATIONS[effectivePriceSource] === false ? `${resolvePriceSourceOption(effectivePriceSource).label} integration is not configured.` : "No data for this wear & range.")), /* @__PURE__ */ React.createElement("div", { className: "tv-lw-canvas", ref: lwContainerRef }), /* @__PURE__ */ React.createElement("div", { className: "tv-lw-tooltip", ref: lwTooltipRef }), /* @__PURE__ */ React.createElement("div", { className: "tv-lw-time-axis-label", ref: lwTimeLabelRef })))))), /* @__PURE__ */ React.createElement("div", { className: classNames("tv-chart-section tv-full-section tv-price-history-section tv-anim-up", isPriceHistoryFullscreen && "is-native-fullscreen"), ref: bindFullscreenRef("price-history") }, /* @__PURE__ */ React.createElement("div", { className: "tv-section-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "tv-section-title" }, t("item_priceHistory")), /* @__PURE__ */ React.createElement("p", { className: "tv-section-subtitle" }, t("item_historicalMarketData", { item: ITEM_DETAILS.title }), HAS_WEAR_VARIANTS ? " (" + selectedInspectWear + ")" : "")), /* @__PURE__ */ React.createElement("div", { className: "tv-section-actions" }, /* @__PURE__ */ React.createElement("div", { className: "tv-data-pill" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-info" }), " ", t("item_providersCount", { count: providerLegend.length })), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "tv-fullscreen-btn" + (isPriceHistoryFullscreen ? " active" : ""),
          onClick: function() {
            toggleFullscreen("price-history");
          },
          title: t("item_toggleFullscreen"),
          "aria-label": isPriceHistoryFullscreen ? t("item_exitFullscreen") : t("item_openFullscreen")
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid " + (isPriceHistoryFullscreen ? "fa-compress" : "fa-expand") })
      ))), /* @__PURE__ */ React.createElement("div", { className: "tv-chart-control-row" }, /* @__PURE__ */ React.createElement("div", { className: "tv-price-history-controls" }, /* @__PURE__ */ React.createElement("div", { className: "tv-range-pills" }, ["30D", "90D", "180D", "1Y"].map(function(range) {
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: range,
            type: "button",
            className: "tv-range-pill" + (provRange2 === range ? " active" : ""),
            onClick: function() {
              setProvRange2(range);
            }
          },
          range
        );
      }))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "tv-provider-select", onClick: function() {
        setProviderMenuOpen(function(open) {
          return !open;
        });
      } }, t("item_selectMarketplace"), " ", /* @__PURE__ */ React.createElement("strong", null, visibleProviderCount, "/", providerLegend.length), /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-" + (providerMenuOpen ? "up" : "down") })), providerMenuOpen ? /* @__PURE__ */ React.createElement("div", { className: "tv-provider-menu" }, providerLegend.map(function(provider) {
        const active = !hiddenProviders.has(provider.name);
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            key: provider.name,
            className: "tv-provider-menu-item" + (active ? " active" : ""),
            onClick: function() {
              toggleProviderVisibility(provider.name);
            }
          },
          /* @__PURE__ */ React.createElement(MarketplaceBadge, { name: provider.name, compact: true }),
          /* @__PURE__ */ React.createElement("span", null, provider.name),
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid " + (active ? "fa-check" : "fa-minus") })
        );
      })) : null), /* @__PURE__ */ React.createElement("div", { className: "tv-prov-legend" }, providerLegend.map(function(provider) {
        const active = !hiddenProviders.has(provider.name);
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            key: provider.name,
            className: "tv-prov-pill" + (active ? "" : " muted"),
            onClick: function() {
              toggleProviderVisibility(provider.name);
            }
          },
          /* @__PURE__ */ React.createElement("span", { className: "tv-prov-dot", style: { background: provider.color }, "aria-hidden": "true" }),
          /* @__PURE__ */ React.createElement(MarketplaceBadge, { name: provider.name, compact: true }),
          provider.name
        );
      })), /* @__PURE__ */ React.createElement("div", { className: "tv-big-canvas tv-provider-canvas" }, /* @__PURE__ */ React.createElement("canvas", { ref: provRef2 }))), /* @__PURE__ */ React.createElement("div", { className: "tv-chart-section tv-full-section tv-market-dist-card tv-market-dist-card--horizontal tv-anim-up" }, /* @__PURE__ */ React.createElement("div", { className: "tv-section-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "tv-section-title" }, t("chart_marketDistributionFor", { item: ITEM_DETAILS.title }))), /* @__PURE__ */ React.createElement("div", { className: "tv-data-pill" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-info" }), " ", tp("chart_dataPoints", distEntries.length), formatDistributionUpdatedAt(distributionUpdatedAt) ? ` · ${formatDistributionUpdatedAt(distributionUpdatedAt)}` : "")), /* @__PURE__ */ React.createElement("div", { className: "tv-market-dist-row tv-market-dist-row--hbar" }, /* @__PURE__ */ React.createElement("div", { className: "tv-dist-hbar-wrap", "aria-label": t("chart_distributionAria") }, /* @__PURE__ */ React.createElement("canvas", { ref: donutRef2 })))), /* @__PURE__ */ React.createElement("div", { className: "tv-chart-section tv-full-section tv-market-compare-section tv-anim-up" }, /* @__PURE__ */ React.createElement("div", { className: "tv-section-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "tv-section-title" }, t("item_marketplaceComparison")), /* @__PURE__ */ React.createElement("p", { className: "tv-section-subtitle" }, t("item_liveAsksFeeCuts", { item: ITEM_DETAILS.title }), HAS_WEAR_VARIANTS ? " (" + selectedInspectWear + ")" : "", "."))), /* @__PURE__ */ React.createElement("div", { className: "tv-chart-control-row" }, /* @__PURE__ */ React.createElement("div", { className: "tv-range-pills" }, COMPARE_MARKET_TABS.map(function(tab) {
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: tab.id,
            type: "button",
            className: "tv-range-pill" + (compareMarketTab === tab.id ? " active" : ""),
            onClick: function() {
              setCompareMarketTab(tab.id);
            }
          },
          tab.label
        );
      }))), activeCompareRow ? /* @__PURE__ */ React.createElement("div", { className: "tv-compare-hero" }, /* @__PURE__ */ React.createElement("div", { className: "tv-compare-hero-market" }, /* @__PURE__ */ React.createElement("span", { className: "tv-compare-market-cell" }, /* @__PURE__ */ React.createElement(MarketplaceBadge, { name: activeCompareRow.label, compact: true }), /* @__PURE__ */ React.createElement("span", { className: "tv-compare-hero-name" }, /* @__PURE__ */ React.createElement("strong", null, activeCompareRow.label)), /* @__PURE__ */ React.createElement(MarketPaymentIcons, { name: activeCompareRow.label }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, activeCompareRow.ask > 0 ? formatPrice(activeCompareRow.ask) : "—"), /* @__PURE__ */ React.createElement("span", null, t("item_price"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, activeCompareRow.feePct > 0 ? activeCompareRow.feePct.toFixed(1) + "%" : "—"), /* @__PURE__ */ React.createElement("span", null, t("item_fee"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, activeCompareRow.feeCut > 0 ? formatPrice(activeCompareRow.feeCut) : "—"), /* @__PURE__ */ React.createElement("span", null, t("item_cut"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, activeCompareRow.net > 0 ? formatPrice(activeCompareRow.net) : "—"), /* @__PURE__ */ React.createElement("span", null, t("item_total"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, activeCompareRow.listings > 0 ? formatCount(activeCompareRow.listings) : "—"), /* @__PURE__ */ React.createElement("span", null, t("item_listings"))), /* @__PURE__ */ React.createElement("div", { className: "tv-compare-hero-vs" }, /* @__PURE__ */ React.createElement("strong", { className: activeCompareRow.vsSteam == null ? "" : activeCompareRow.vsSteam <= 0 ? "is-down" : "is-up" }, activeCompareRow.vsSteam == null ? "—" : (activeCompareRow.vsSteam > 0 ? "+" : "") + activeCompareRow.vsSteam.toFixed(1) + "%"), /* @__PURE__ */ React.createElement("span", null, t("item_vsSteam")))) : null, /* @__PURE__ */ React.createElement("div", { className: "tv-compare-table", role: "table" }, /* @__PURE__ */ React.createElement("div", { className: "tv-compare-table-head", role: "row" }, /* @__PURE__ */ React.createElement("span", null, t("item_market")), /* @__PURE__ */ React.createElement("span", null, t("item_price")), /* @__PURE__ */ React.createElement("span", null, t("item_fee")), /* @__PURE__ */ React.createElement("span", null, t("item_cut")), /* @__PURE__ */ React.createElement("span", null, t("item_total")), /* @__PURE__ */ React.createElement("span", null, t("item_listings")), /* @__PURE__ */ React.createElement("span", null, t("item_vsSteam"))), marketplaceCompareRows.map(function(row) {
        const isActive = row.id === compareMarketTab;
        const isBest = cheapestCompare && row.id === cheapestCompare.id && row.ask > 0;
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            key: row.id,
            className: "tv-compare-table-row" + (isActive ? " active" : "") + (isBest ? " is-best" : ""),
            onClick: function() {
              setCompareMarketTab(row.id);
              if (row.market_url) {
                window.open(row.market_url, "_blank", "noopener,noreferrer");
              }
            },
            role: "row",
            title: row.market_url ? "Open " + row.label : void 0
          },
          /* @__PURE__ */ React.createElement("span", { className: "tv-compare-market-cell" }, /* @__PURE__ */ React.createElement(MarketplaceBadge, { name: row.label, compact: true }), row.label, /* @__PURE__ */ React.createElement(MarketPaymentIcons, { name: row.label })),
          /* @__PURE__ */ React.createElement("span", null, row.ask > 0 ? formatPrice(row.ask) : "—"),
          /* @__PURE__ */ React.createElement("span", null, row.feePct > 0 ? row.feePct.toFixed(1) + "%" : "—"),
          /* @__PURE__ */ React.createElement("span", null, row.feeCut > 0 ? formatPrice(row.feeCut) : "—"),
          /* @__PURE__ */ React.createElement("span", null, row.net > 0 ? formatPrice(row.net) : "—"),
          /* @__PURE__ */ React.createElement("span", null, row.listings > 0 ? formatCount(row.listings) : "—"),
          /* @__PURE__ */ React.createElement("span", { className: "tv-compare-vs-cell" + (row.vsSteam == null ? "" : row.vsSteam <= 0 ? " is-down" : " is-up") }, row.vsSteam == null ? "—" : (row.vsSteam > 0 ? "+" : "") + row.vsSteam.toFixed(1) + "%")
        );
      }))), relatedFinishesCategory && relatedFinishes.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tv-chart-section tv-full-section tv-related-finishes-section tv-anim-up" }, /* @__PURE__ */ React.createElement("div", { className: "tv-section-row" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "tv-section-title" }, relatedFinishesSectionTitle)), relatedFinishesAllHref ? /* @__PURE__ */ React.createElement(
        "a",
        {
          className: "tv-related-finishes-all",
          href: relatedFinishesAllHref + (relatedFinishesIsAgent ? "" : "?q=" + encodeURIComponent(relatedFinishesWeapon))
        },
        "All ",
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-right" })
      ) : null), /* @__PURE__ */ React.createElement("div", { className: "tv-related-finishes-grid" }, relatedFinishes.map(function(finish, index) {
        return /* @__PURE__ */ React.createElement(
          "a",
          {
            key: finish.market_hash_name,
            className: "tv-contents-card",
            href: buildRelatedFinishHref(finish),
            style: {
              "--rarity-accent": "#" + (finish.rarity_hex || "94A3B8"),
              "--card-delay": Math.min(index, 24) * 35 + "ms"
            },
            title: "Open " + finish.display_name
          },
          /* @__PURE__ */ React.createElement("div", { className: "tv-contents-card-media" }, /* @__PURE__ */ React.createElement("img", { src: finish.image, alt: finish.display_name, loading: "lazy", decoding: "async" })),
          /* @__PURE__ */ React.createElement("div", { className: "tv-contents-card-copy" }, /* @__PURE__ */ React.createElement("h3", null, finish.display_name), /* @__PURE__ */ React.createElement("p", { className: "tv-contents-card-sub" }, finish.listings > 0 ? formatCount(finish.listings) + " listings" : ""), /* @__PURE__ */ React.createElement("div", { className: "tv-contents-card-price-line" }, /* @__PURE__ */ React.createElement("strong", null, finish.price > 0 ? formatPrice(finish.price) : "—")), /* @__PURE__ */ React.createElement("div", { className: "tv-contents-card-foot" }, /* @__PURE__ */ React.createElement("span", null, finish.rarity_label || "")))
        );
      }))) : null, canSimulateContainer && caseOddsSummary ? /* @__PURE__ */ React.createElement("section", { className: "tv-chart-section tv-oddscalc-section tv-anim-up" }, /* @__PURE__ */ React.createElement("h2", { className: "tv-section-title" }, "Is this case worth opening"), /* @__PURE__ */ React.createElement("div", { className: "tv-oddscalc-stats" }, /* @__PURE__ */ React.createElement("div", { className: "tv-oddscalc-stat" }, /* @__PURE__ */ React.createElement("span", { className: "tv-oddscalc-stat-label" }, "Opening Cost"), /* @__PURE__ */ React.createElement("strong", null, formatPrice(caseOddsSummary.openingCost)), /* @__PURE__ */ React.createElement("span", { className: "tv-oddscalc-stat-sub" }, caseOddsSummary.isTerminal ? "terminal " : "case ", formatPrice(caseOddsSummary.casePrice), caseOddsSummary.keyCost > 0 ? " + key " + formatPrice(caseOddsSummary.keyCost) : "")), /* @__PURE__ */ React.createElement("div", { className: "tv-oddscalc-stat" }, /* @__PURE__ */ React.createElement("span", { className: "tv-oddscalc-stat-label" }, "Expected Value"), /* @__PURE__ */ React.createElement("strong", null, formatPrice(caseOddsSummary.expectedValue)), /* @__PURE__ */ React.createElement("span", { className: "tv-oddscalc-stat-sub" }, "per opening")), /* @__PURE__ */ React.createElement("div", { className: "tv-oddscalc-stat" }, /* @__PURE__ */ React.createElement("span", { className: "tv-oddscalc-stat-label" }, "You Get Back"), /* @__PURE__ */ React.createElement("strong", null, Math.round(caseOddsSummary.getBackPct), "¢ / €1"), /* @__PURE__ */ React.createElement("span", { className: "tv-oddscalc-stat-sub" }, "before selling fees")), /* @__PURE__ */ React.createElement("div", { className: "tv-oddscalc-stat" }, /* @__PURE__ */ React.createElement("span", { className: "tv-oddscalc-stat-label" }, "To Hit The Rare Slot"), /* @__PURE__ */ React.createElement("strong", null, caseOddsSummary.openingsToHitRare != null ? "≈ " + Math.round(caseOddsSummary.openingsToHitRare) + " openings" : "—"), /* @__PURE__ */ React.createElement("span", { className: "tv-oddscalc-stat-sub" }, caseOddsSummary.costToHitRare != null ? "≈ " + formatPrice(caseOddsSummary.costToHitRare) + " at current prices" : ""))), /* @__PURE__ */ React.createElement("div", { className: "tv-oddscalc-table", role: "table" }, /* @__PURE__ */ React.createElement("div", { className: "tv-oddscalc-table-head", role: "row" }, /* @__PURE__ */ React.createElement("span", null, "Tier"), /* @__PURE__ */ React.createElement("span", null, "Odds"), /* @__PURE__ */ React.createElement("span", null, "Avg Item Value"), /* @__PURE__ */ React.createElement("span", null, "Adds to EV")), caseOddsSummary.tiers.map((tier) => /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "tv-oddscalc-table-row",
          role: "row",
          key: tier.key,
          style: { "--rarity-accent": "#" + contentsRarityHex(tier.key === "rare_special" ? "contraband" : tier.key) }
        },
        /* @__PURE__ */ React.createElement("span", { className: "tv-oddscalc-tier-cell" }, tier.label),
        /* @__PURE__ */ React.createElement("span", null, (tier.chance * 100).toFixed(2), "%"),
        /* @__PURE__ */ React.createElement("span", null, formatPrice(tier.avg_value)),
        /* @__PURE__ */ React.createElement("span", null, formatPrice(tier.addsToEv))
      ))), /* @__PURE__ */ React.createElement("p", { className: "tv-oddscalc-verdict" }, /* @__PURE__ */ React.createElement("strong", null, "Verdict: opening is entertainment, not value."), " You get back", " ", Math.round(caseOddsSummary.getBackPct), "% of the opening cost on average, and the rare slot takes", " ≈ " + Math.round(caseOddsSummary.openingsToHitRare || 0) + " ", "openings to hit. If you want a specific skin, buying it outright is almost always cheaper."), /* @__PURE__ */ React.createElement("p", { className: "tv-oddscalc-foot" }, "EV = Valve's published tier odds × current Steam prices for this case's items per rarity (rare/knife slot via CS ROI).")) : null, canSimulateContainer && containerContentsCards.length >= 2 ? /* @__PURE__ */ React.createElement("section", { className: "tv-chart-section tv-contents-section tv-anim-up" + (looksLikeCapsuleContainer(ITEM_DETAILS.title, visualType) ? " tv-contents-section--capsule" : "") }, looksLikeCapsuleContainer(ITEM_DETAILS.title, visualType) ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "tv-capsule-contents-bar" }, /* @__PURE__ */ React.createElement("span", null, "What's Inside"), /* @__PURE__ */ React.createElement("span", { className: "tv-capsule-contents-count" }, containerContentsCards.length, " items")), /* @__PURE__ */ React.createElement("div", { className: "tv-capsule-tile-grid" }, containerContentsCards.map(function(card, index) {
        return /* @__PURE__ */ React.createElement(
          "a",
          {
            key: card.key,
            className: "tv-capsule-tile rarity-" + card.rarity,
            href: card.href,
            style: {
              "--rarity-accent": "#" + card.rarityHex,
              "--card-delay": 60 + Math.min(index, 24) * 35 + "ms"
            },
            title: "Open " + card.title
          },
          /* @__PURE__ */ React.createElement("div", { className: "tv-capsule-tile-media" }, card.img ? /* @__PURE__ */ React.createElement("img", { src: card.img, alt: card.title, loading: "lazy", decoding: "async" }) : /* @__PURE__ */ React.createElement("div", { className: "tv-capsule-tile-placeholder", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-box-open" })), /* @__PURE__ */ React.createElement("span", { className: "tv-capsule-tile-rarity", "aria-hidden": "true" })),
          /* @__PURE__ */ React.createElement("div", { className: "tv-capsule-tile-meta" }, /* @__PURE__ */ React.createElement("span", { className: "tv-capsule-tile-name" }, card.title), /* @__PURE__ */ React.createElement("span", { className: "tv-capsule-tile-price" + (contentsPricesLoading && !card.priceDisplay ? " is-loading" : "") }, card.priceDisplay || (contentsPricesLoading ? "…" : "—")))
        );
      }))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "tv-contents-hdr" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "tv-section-title" }, containerContentsSectionTitle(ITEM_DETAILS.title, t)), /* @__PURE__ */ React.createElement("p", { className: "tv-section-subtitle" }, "Everything that can drop from ", ITEM_DETAILS.title, ", with live Steam prices when available.")), /* @__PURE__ */ React.createElement("div", { className: "tv-contents-summary" }, /* @__PURE__ */ React.createElement("strong", { className: "tv-contents-summary-price" }, containerContentsCards.length), /* @__PURE__ */ React.createElement("span", { className: "tv-contents-summary-meta" }, "tracked items"))), /* @__PURE__ */ React.createElement("div", { className: "tv-contents-grid" }, containerContentsCards.map(function(card, index) {
        return /* @__PURE__ */ React.createElement(
          "a",
          {
            key: card.key,
            className: "tv-contents-card rarity-" + card.rarity,
            href: card.href,
            style: {
              "--rarity-accent": "#" + card.rarityHex,
              "--card-delay": 60 + Math.min(index, 24) * 35 + "ms"
            },
            title: "Open " + card.title
          },
          /* @__PURE__ */ React.createElement("div", { className: "tv-contents-card-media" }, card.img ? /* @__PURE__ */ React.createElement("img", { src: card.img, alt: card.title, loading: "lazy", decoding: "async" }) : /* @__PURE__ */ React.createElement("div", { className: "tv-contents-card-placeholder", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-gun" }))),
          /* @__PURE__ */ React.createElement("div", { className: "tv-contents-card-copy" }, /* @__PURE__ */ React.createElement("h3", null, card.title), /* @__PURE__ */ React.createElement("p", { className: "tv-contents-card-sub" }, card.subtitle), /* @__PURE__ */ React.createElement("div", { className: "tv-contents-card-price-line" }, /* @__PURE__ */ React.createElement("strong", { className: contentsPricesLoading && !card.priceDisplay ? "is-loading" : "" }, card.priceDisplay || (contentsPricesLoading ? "…" : "—"))), /* @__PURE__ */ React.createElement("div", { className: "tv-contents-card-foot" }, /* @__PURE__ */ React.createElement("span", null, card.rarityLabel)))
        );
      })))) : null, /* @__PURE__ */ React.createElement("section", { className: "tv-social tv-anim-up" }, /* @__PURE__ */ React.createElement("div", { className: "tv-social-hdr" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "tv-section-title" }, t("social_title")), /* @__PURE__ */ React.createElement("p", { className: "tv-social-sub" }, t("social_sub"))), /* @__PURE__ */ React.createElement("span", { className: "tv-social-count" }, tp("social_postCount", socialPosts.length))), /* @__PURE__ */ React.createElement("div", { className: "tv-post-form-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "tv-post-form" }, /* @__PURE__ */ React.createElement("div", { className: "tv-post-form-identity" + (socialIdentity.isLoggedIn ? "" : " tv-post-form-identity--guest") }, socialIdentity.isLoggedIn ? /* @__PURE__ */ React.createElement("div", { className: "tv-post-author-label" }, socialIdentity.author) : null, /* @__PURE__ */ React.createElement(
        "img",
        {
          className: "tv-post-avatar tv-post-avatar--identity",
          src: socialIdentity.isLoggedIn ? socialIdentity.avatar : socialAvatarUrl(GUEST_SOCIAL_AVATAR_SEED),
          alt: socialIdentity.isLoggedIn ? socialIdentity.author : t("social_guest")
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "tv-post-form-compose" + (socialIdentity.isLoggedIn ? "" : " tv-post-form-compose--guest") }, /* @__PURE__ */ React.createElement(
        "textarea",
        {
          className: "tv-post-input",
          rows: 3,
          placeholder: t("social_placeholder", { item: ITEM_DETAILS.title }),
          value: socialText,
          onChange: function(e) {
            setSocialText(e.target.value);
            setSocialError("");
          }
        }
      ), socialImagePreview ? /* @__PURE__ */ React.createElement("div", { className: "tv-post-image-preview" }, /* @__PURE__ */ React.createElement("img", { src: socialImagePreview, alt: "" }), /* @__PURE__ */ React.createElement("button", { type: "button", className: "tv-post-image-preview-x", onClick: clearSocialImage, "aria-label": t("social_removeImage") }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark" }))) : null, /* @__PURE__ */ React.createElement("div", { className: "tv-post-form-actions" }, /* @__PURE__ */ React.createElement("div", { className: "tv-sentiment-row" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "tv-sent-btn bullish" + (socialSentiment === "bullish" ? " active" : ""),
          onClick: function() {
            setSocialSentiment(socialSentiment === "bullish" ? null : "bullish");
          }
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-trend-up" }),
        " ",
        t("social_bullish")
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "tv-sent-btn bearish" + (socialSentiment === "bearish" ? " active" : ""),
          onClick: function() {
            setSocialSentiment(socialSentiment === "bearish" ? null : "bearish");
          }
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-trend-down" }),
        " ",
        t("social_bearish")
      ), /* @__PURE__ */ React.createElement(
        "input",
        {
          className: "tv-target-input",
          type: "number",
          min: "0",
          step: "0.01",
          placeholder: t("social_target", { currency: PRICE_SYMBOL }),
          value: socialTarget,
          onChange: function(e) {
            setSocialTarget(e.target.value);
          }
        }
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "tv-sent-btn tv-post-attach" + (socialImageFile ? " has-file" : ""),
          title: t("social_attachImage"),
          onClick: function() {
            if (socialImageInputRef.current) socialImageInputRef.current.click();
          }
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-image" })
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "tv-sent-btn tv-post-attach" + (socialGiphyUrl ? " has-file" : ""),
          title: t("social_attachGif"),
          onClick: openGiphyPicker
        },
        /* @__PURE__ */ React.createElement("span", { className: "tv-post-gif-label" }, "GIF")
      ), /* @__PURE__ */ React.createElement(
        "input",
        {
          ref: socialImageInputRef,
          type: "file",
          accept: SOCIAL_IMAGE_ACCEPT,
          hidden: true,
          onChange: function(e) {
            const file = e.target.files && e.target.files[0];
            pickSocialImage(file || null);
          }
        }
      )), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "tv-post-submit tv-post-submit--compact",
          disabled: !socialText.trim() && !socialGiphyUrl || socialSubmitting,
          onClick: handleSocialSubmit
        },
        socialSubmitting ? t("social_posting") : t("social_publishIdea")
      )))), /* @__PURE__ */ React.createElement("p", { className: "tv-social-local-note" }, t("social_sharedNote")), socialError ? /* @__PURE__ */ React.createElement("p", { className: "tv-social-error" }, socialError) : null), /* @__PURE__ */ React.createElement("div", { className: "tv-feed" }, socialLoading ? /* @__PURE__ */ React.createElement("p", { className: "tv-social-sub" }, t("social_loadingPosts")) : null, !socialLoading && !socialPosts.length ? /* @__PURE__ */ React.createElement("p", { className: "tv-social-sub" }, t("social_empty")) : null, visibleSocialPosts.map(function(post) {
        const reaction = socialReactions[post.id] || "";
        const canManage = canManageSocialPost(post, socialIdentity);
        const isEditing = editingPostId === String(post.id);
        const isBusy = socialActionId === String(post.id);
        const comments = Array.isArray(post.comments) ? post.comments : [];
        const threadExpanded = Boolean(expandedCommentPosts[post.id]);
        const visibleComments = threadExpanded || comments.length < SOCIAL_THREAD_VISIBLE ? comments : comments.slice(0, SOCIAL_THREAD_VISIBLE);
        const hiddenCommentCount = Math.max(0, comments.length - SOCIAL_THREAD_VISIBLE);
        const isServerPost = !String(post.id).startsWith("local-");
        return /* @__PURE__ */ React.createElement("article", { className: "tv-post", key: post.id }, /* @__PURE__ */ React.createElement("div", { className: "tv-post-hdr" }, /* @__PURE__ */ React.createElement("img", { className: "tv-post-avatar", src: post.avatar || socialAvatarUrl(post.author), alt: "" }), /* @__PURE__ */ React.createElement("div", { className: "tv-post-meta" }, /* @__PURE__ */ React.createElement("div", { className: "tv-post-meta-row" }, /* @__PURE__ */ React.createElement("span", { className: "tv-post-author" }, post.author), post.sentiment && !isEditing ? /* @__PURE__ */ React.createElement("span", { className: "tv-post-sent " + post.sentiment }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-trend-" + (post.sentiment === "bullish" ? "up" : "down") }), post.sentiment === "bullish" ? t("social_bullish") : t("social_bearish"), post.target ? /* @__PURE__ */ React.createElement("span", { className: "tv-post-target" }, " · ", t("social_targetLabel"), " ", PRICE_SYMBOL, Number(post.target).toFixed(2)) : null) : null), /* @__PURE__ */ React.createElement("span", { className: "tv-post-time" }, timeAgo(post.createdAt)))), isEditing ? /* @__PURE__ */ React.createElement("div", { className: "tv-post-edit" }, /* @__PURE__ */ React.createElement(
          "textarea",
          {
            className: "tv-post-edit-input",
            rows: 3,
            value: editingDraft.body,
            onChange: function(e) {
              setEditingDraft(function(prev) {
                return Object.assign({}, prev, { body: e.target.value });
              });
            }
          }
        ), /* @__PURE__ */ React.createElement("div", { className: "tv-post-edit-meta" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "tv-sent-btn bullish" + (editingDraft.sentiment === "bullish" ? " active" : ""),
            onClick: function() {
              setEditingDraft(function(prev) {
                return Object.assign({}, prev, {
                  sentiment: prev.sentiment === "bullish" ? null : "bullish"
                });
              });
            }
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-trend-up" }),
          " ",
          t("social_bullish")
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "tv-sent-btn bearish" + (editingDraft.sentiment === "bearish" ? " active" : ""),
            onClick: function() {
              setEditingDraft(function(prev) {
                return Object.assign({}, prev, {
                  sentiment: prev.sentiment === "bearish" ? null : "bearish"
                });
              });
            }
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-trend-down" }),
          " ",
          t("social_bearish")
        ), /* @__PURE__ */ React.createElement(
          "input",
          {
            className: "tv-target-input",
            type: "number",
            min: "0",
            step: "0.01",
            placeholder: t("social_target", { currency: PRICE_SYMBOL }),
            value: editingDraft.target,
            onChange: function(e) {
              setEditingDraft(function(prev) {
                return Object.assign({}, prev, { target: e.target.value });
              });
            }
          }
        )), /* @__PURE__ */ React.createElement("div", { className: "tv-post-edit-actions" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "tv-post-edit-cancel",
            disabled: isBusy,
            onClick: handleSocialEditCancel
          },
          t("social_cancel")
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "tv-post-submit",
            disabled: !editingDraft.body.trim() || isBusy,
            onClick: function() {
              handleSocialEditSave(post);
            }
          },
          isBusy ? t("social_saving") : t("social_save")
        ))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("p", { className: "tv-post-body" }, post.body), post.image ? /* @__PURE__ */ React.createElement("figure", { className: "tv-post-photo" }, /* @__PURE__ */ React.createElement("img", { src: post.image, alt: "" })) : null), !isEditing ? /* @__PURE__ */ React.createElement("div", { className: "tv-post-actions" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "tv-react-btn" + (reaction === "like" ? " active-like" : ""),
            onClick: function() {
              handleSocialReaction(post.id, "like");
            }
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-thumbs-up" }),
          " ",
          post.likes || 0
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "tv-react-btn" + (reaction === "dislike" ? " active-dislike" : ""),
            onClick: function() {
              handleSocialReaction(post.id, "dislike");
            }
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-thumbs-down" }),
          " ",
          post.dislikes || 0
        ), isServerPost && socialIdentity.isLoggedIn ? /* @__PURE__ */ React.createElement("span", { className: "tv-post-attach-wrap" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "tv-react-btn tv-post-attach" + (commentImages[post.id] ? " has-file" : ""),
            title: t("social_attachImage"),
            "aria-label": t("social_attachImageToComment"),
            onClick: function() {
              const input = document.getElementById("tv-comment-file-" + post.id);
              if (input) input.click();
            }
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-image" })
        ), /* @__PURE__ */ React.createElement(
          "input",
          {
            id: "tv-comment-file-" + post.id,
            className: "tv-post-file-input",
            type: "file",
            accept: SOCIAL_IMAGE_ACCEPT,
            hidden: true,
            onChange: function(e) {
              const file = e.target.files && e.target.files[0];
              if (!file) return;
              if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
                setSocialError(t("social_errImageType"));
                return;
              }
              if (file.size > SOCIAL_IMAGE_MAX_BYTES) {
                setSocialError(t("social_errImageSize"));
                return;
              }
              const preview = commentPreviews[post.id];
              if (preview && String(preview).startsWith("blob:")) {
                try {
                  URL.revokeObjectURL(preview);
                } catch (_err) {
                }
              }
              setCommentImages(function(prev) {
                return Object.assign({}, prev, { [post.id]: file });
              });
              try {
                const url = URL.createObjectURL(file);
                setCommentPreviews(function(prev) {
                  return Object.assign({}, prev, { [post.id]: url });
                });
              } catch (_err) {
              }
            }
          }
        )) : null, canManage ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "tv-react-btn tv-post-manage-btn",
            title: t("social_editPost"),
            disabled: Boolean(socialActionId),
            onClick: function() {
              handleSocialEditStart(post);
            }
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-pen" })
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "tv-react-btn tv-post-manage-btn danger",
            title: t("social_deletePost"),
            disabled: Boolean(socialActionId),
            onClick: function() {
              handleSocialDelete(post);
            }
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash" })
        )) : null, isServerPost && socialIdentity.isLoggedIn ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "tv-post-submit tv-comment-submit",
            disabled: !String(commentDrafts[post.id] || "").trim() || commentBusyId === String(post.id),
            onClick: function() {
              handleSocialCommentSubmit(post);
            }
          },
          commentBusyId === String(post.id) ? t("social_posting") : t("social_comment")
        ) : null) : null, !isEditing && isServerPost && comments.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tv-post-comments" }, visibleComments.map(function(comment) {
          return /* @__PURE__ */ React.createElement("div", { className: "tv-post-comment", key: comment.id }, /* @__PURE__ */ React.createElement("div", { className: "tv-post-comment-hdr" }, /* @__PURE__ */ React.createElement("img", { className: "tv-post-avatar", src: comment.avatar || socialAvatarUrl(comment.author), alt: "" }), /* @__PURE__ */ React.createElement("div", { className: "tv-post-meta" }, /* @__PURE__ */ React.createElement("span", { className: "tv-post-author" }, comment.author), /* @__PURE__ */ React.createElement("span", { className: "tv-post-time" }, timeAgo(comment.createdAt)))), /* @__PURE__ */ React.createElement("p", { className: "tv-post-comment-body" }, comment.body), comment.image ? /* @__PURE__ */ React.createElement("figure", { className: "tv-post-photo" }, /* @__PURE__ */ React.createElement("img", { src: comment.image, alt: "" })) : null);
        }), hiddenCommentCount > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tv-feed-more" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "tv-feed-more-btn",
            onClick: function() {
              setExpandedCommentPosts(function(prev) {
                const next = Object.assign({}, prev);
                if (threadExpanded) delete next[post.id];
                else next[post.id] = true;
                return next;
              });
            }
          },
          threadExpanded ? t("social_showFewerComments") : tp("social_showMoreComments", hiddenCommentCount)
        )) : null) : null, !isEditing && isServerPost ? socialIdentity.isLoggedIn ? /* @__PURE__ */ React.createElement("div", { className: "tv-comment-form" }, /* @__PURE__ */ React.createElement(
          "textarea",
          {
            className: "tv-post-input",
            rows: 2,
            placeholder: t("social_addComment"),
            value: commentDrafts[post.id] || "",
            onChange: function(e) {
              const value = e.target.value;
              setCommentDrafts(function(prev) {
                return Object.assign({}, prev, { [post.id]: value });
              });
              setSocialError("");
            }
          }
        ), commentPreviews[post.id] ? /* @__PURE__ */ React.createElement("div", { className: "tv-post-image-preview" }, /* @__PURE__ */ React.createElement("img", { src: commentPreviews[post.id], alt: "" }), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "tv-post-image-preview-x",
            "aria-label": t("social_removeImage"),
            onClick: function() {
              const preview = commentPreviews[post.id];
              if (preview && String(preview).startsWith("blob:")) {
                try {
                  URL.revokeObjectURL(preview);
                } catch (_e) {
                }
              }
              setCommentImages(function(prev) {
                const next = Object.assign({}, prev);
                delete next[post.id];
                return next;
              });
              setCommentPreviews(function(prev) {
                const next = Object.assign({}, prev);
                delete next[post.id];
                return next;
              });
            }
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark" })
        )) : null) : /* @__PURE__ */ React.createElement("p", { className: "tv-social-sub tv-comment-login-prompt" }, /* @__PURE__ */ React.createElement("a", { className: "tv-steam-login-btn tv-steam-login-btn--inline", href: steamLoginHref() }, t("social_signInToComment"))) : null);
      }), !socialLoading && hiddenSocialCount > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tv-feed-more" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "tv-feed-more-btn",
          onClick: function() {
            setSocialFeedExpanded(!socialFeedExpanded);
          }
        },
        socialFeedExpanded ? t("social_showFewerPosts") : tp("social_showMorePosts", hiddenSocialCount)
      )) : null))), giphyOpen ? /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "tv-overlay tv-giphy-overlay",
          onMouseDown: function(event) {
            if (event.target === event.currentTarget) closeGiphyPicker();
          }
        },
        /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "tv-modal tv-giphy-modal",
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": "tv-giphy-title",
            onMouseDown: function(event) {
              event.stopPropagation();
            }
          },
          /* @__PURE__ */ React.createElement("div", { className: "tv-modal-hdr" }, /* @__PURE__ */ React.createElement("h3", { id: "tv-giphy-title" }, t("giphy_title")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "tv-modal-x", onClick: closeGiphyPicker, "aria-label": t("giphy_close") }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark" }))),
          /* @__PURE__ */ React.createElement(
            "form",
            {
              className: "tv-giphy-search",
              onSubmit: function(event) {
                event.preventDefault();
                const q = giphyQuery.trim();
                if (!q) return;
                if (giphySearchTimerRef.current) {
                  clearTimeout(giphySearchTimerRef.current);
                  giphySearchTimerRef.current = null;
                }
                loadGiphyResults("search", q);
              }
            },
            /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass", "aria-hidden": "true" }),
            /* @__PURE__ */ React.createElement(
              "input",
              {
                type: "search",
                value: giphyQuery,
                placeholder: t("giphy_searchPlaceholder"),
                onChange: function(e) {
                  setGiphyQuery(e.target.value);
                },
                autoFocus: true
              }
            )
          ),
          giphyView === "results" ? /* @__PURE__ */ React.createElement("div", { className: "tv-giphy-results-bar" }, /* @__PURE__ */ React.createElement(
            "button",
            {
              type: "button",
              className: "tv-giphy-back",
              onClick: function() {
                if (giphySearchTimerRef.current) {
                  clearTimeout(giphySearchTimerRef.current);
                  giphySearchTimerRef.current = null;
                }
                giphySearchSeqRef.current += 1;
                giphyTypedQueryRef.current = false;
                setGiphyQuery("");
                setGiphyView("categories");
                setGiphyHeading({ kind: "categories", query: "" });
                setGiphyResults([]);
                setGiphyError("");
                setGiphyLoading(false);
              }
            },
            /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-left", "aria-hidden": "true" }),
            t("giphy_categories")
          ), /* @__PURE__ */ React.createElement("span", { className: "tv-giphy-heading" }, giphyHeading?.kind === "favourites" ? t("giphy_favourites") : giphyHeading?.kind === "trending" ? t("giphy_trending") : giphyHeading?.kind === "search" ? giphyHeading.query || t("giphy_results") : t("giphy_categories"))) : null,
          /* @__PURE__ */ React.createElement("div", { className: "tv-giphy-body" }, giphyLoading ? /* @__PURE__ */ React.createElement("p", { className: "tv-giphy-status" }, t("giphy_loading")) : null, !giphyLoading && giphyError ? /* @__PURE__ */ React.createElement("p", { className: "tv-giphy-status is-error" }, giphyError) : null, !giphyLoading && !giphyError && giphyView === "categories" ? /* @__PURE__ */ React.createElement("div", { className: "tv-giphy-cats" }, GIPHY_CATEGORIES.map(function(cat) {
            const isFav = cat.kind === "favourites";
            const previewUrl = isFav ? lastSavedGiphyFavouriteUrl(giphyFavs) : String(giphyCatPreviews?.[cat.id] || "").trim();
            return /* @__PURE__ */ React.createElement(
              "button",
              {
                key: cat.id,
                type: "button",
                className: "tv-giphy-cat" + (isFav ? " is-fav" : "") + (previewUrl ? " has-preview" : ""),
                onClick: function() {
                  if (cat.kind === "favourites") loadGiphyResults("favourites");
                  else if (cat.kind === "trending") loadGiphyResults("trending");
                  else loadGiphyResults("search", cat.q);
                }
              },
              previewUrl ? /* @__PURE__ */ React.createElement(
                "span",
                {
                  className: "tv-giphy-cat-bg",
                  style: { backgroundImage: 'url("' + previewUrl.replace(/\\/g, "\\\\").replace(/"/g, "%22") + '")' },
                  "aria-hidden": "true"
                }
              ) : null,
              /* @__PURE__ */ React.createElement("span", { className: "tv-giphy-cat-shade", "aria-hidden": "true" }),
              /* @__PURE__ */ React.createElement("span", { className: "tv-giphy-cat-label" }, cat.icon ? /* @__PURE__ */ React.createElement("i", { className: cat.icon, "aria-hidden": "true" }) : null, /* @__PURE__ */ React.createElement("span", null, t(cat.labelKey)))
            );
          })) : null, !giphyLoading && !giphyError && giphyView === "results" ? giphyResults.length ? /* @__PURE__ */ React.createElement("div", { className: "tv-giphy-grid" }, giphyResults.map(function(gif) {
            const favOn = isGiphyFavourite(gif.id);
            return /* @__PURE__ */ React.createElement("div", { key: gif.id, className: "tv-giphy-cell" }, /* @__PURE__ */ React.createElement(
              "button",
              {
                type: "button",
                className: "tv-giphy-cell-pick",
                title: gif.title || "GIF",
                onClick: function() {
                  pickSocialGiphy(gif);
                }
              },
              /* @__PURE__ */ React.createElement("img", { src: gif.preview || gif.url, alt: gif.title || "", loading: "lazy" })
            ), /* @__PURE__ */ React.createElement(
              "button",
              {
                type: "button",
                className: "tv-giphy-fav-btn" + (favOn ? " is-on" : ""),
                "aria-label": favOn ? t("giphy_removeFav") : t("giphy_saveFav"),
                "aria-pressed": favOn ? "true" : "false",
                onClick: function(event) {
                  toggleGiphyFavourite(gif, event);
                }
              },
              /* @__PURE__ */ React.createElement("i", { className: favOn ? "fa-solid fa-heart" : "fa-regular fa-heart", "aria-hidden": "true" })
            ));
          })) : /* @__PURE__ */ React.createElement("p", { className: "tv-giphy-status" }, t("giphy_noResults")) : null),
          /* @__PURE__ */ React.createElement("div", { className: "tv-giphy-foot" }, /* @__PURE__ */ React.createElement("span", null, t("giphy_poweredBy")))
        )
      ) : null, showShareModal && /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "cs2-login-overlay",
          onMouseDown: function(event) {
            if (event.target === event.currentTarget) setShowShareModal(false);
          }
        },
        /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "cs2-login-modal tv-share-modal",
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": "tv-share-title"
          },
          /* @__PURE__ */ React.createElement("div", { className: "cs2-login-head" }, /* @__PURE__ */ React.createElement("h2", { id: "tv-share-title", className: "cs2-login-title" }, t("share_title")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "cs2-login-close", onClick: function() {
            setShowShareModal(false);
          }, "aria-label": t("giphy_close") }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark", "aria-hidden": "true" }))),
          /* @__PURE__ */ React.createElement("div", { className: "cs2-login-form" }, /* @__PURE__ */ React.createElement("div", { className: "cs2-login-field" }, /* @__PURE__ */ React.createElement("label", { className: "cs2-login-label", htmlFor: "tv-share-url" }, t("share_pageLink")), /* @__PURE__ */ React.createElement(
            "input",
            {
              id: "tv-share-url",
              className: "cs2-login-input",
              readOnly: true,
              value: window.location.href,
              onClick: function(e) {
                e.currentTarget.select();
              }
            }
          )), /* @__PURE__ */ React.createElement(
            "button",
            {
              type: "button",
              className: "cs2-login-submit",
              onClick: function() {
                if (navigator.clipboard) navigator.clipboard.writeText(window.location.href);
              }
            },
            t("share_copy")
          )),
          /* @__PURE__ */ React.createElement("div", { className: "cs2-login-divider", role: "separator" }, /* @__PURE__ */ React.createElement("span", null, t("share_orShareVia"))),
          /* @__PURE__ */ React.createElement("div", { className: "cs2-login-socials" }, /* @__PURE__ */ React.createElement(
            "a",
            {
              className: "cs2-login-social is-live",
              href: "https://twitter.com/intent/tweet?text=" + encodeURIComponent(ITEM_DETAILS.title) + "&url=" + encodeURIComponent(window.location.href),
              target: "_blank",
              rel: "noopener noreferrer",
              "aria-label": "Share on X",
              title: "Share on X"
            },
            /* @__PURE__ */ React.createElement("i", { className: "fa-brands fa-x-twitter", "aria-hidden": "true" })
          ), /* @__PURE__ */ React.createElement(
            "a",
            {
              className: "cs2-login-social is-live",
              href: "https://reddit.com/submit?url=" + encodeURIComponent(window.location.href) + "&title=" + encodeURIComponent(ITEM_DETAILS.title),
              target: "_blank",
              rel: "noopener noreferrer",
              "aria-label": "Share on Reddit",
              title: "Share on Reddit"
            },
            /* @__PURE__ */ React.createElement("i", { className: "fa-brands fa-reddit", "aria-hidden": "true" })
          ), /* @__PURE__ */ React.createElement(
            "button",
            {
              type: "button",
              className: "cs2-login-social is-live",
              "aria-label": "Copy link for Discord",
              title: "Copy link for Discord",
              onClick: function() {
                if (navigator.clipboard) navigator.clipboard.writeText(window.location.href);
              }
            },
            /* @__PURE__ */ React.createElement("i", { className: "fa-brands fa-discord", "aria-hidden": "true" })
          ))
        )
      ), alertModalOpen && /* @__PURE__ */ React.createElement(
        ItemPriceAlertModal,
        {
          itemName: ITEM_DETAILS.title + (selectedInspectWear ? " (" + selectedInspectWear + ")" : ""),
          sourceLabel: activeMarketLabel,
          existingAlert,
          currentPrice: currentAlertPrice,
          onClose: function() {
            setAlertModalOpen(false);
          },
          onSave: handleSavePriceAlert
        }
      ), caseSimOpen && (caseSimLoading || !caseSimConfig || !CaseSimulator) ? /* @__PURE__ */ React.createElement("div", { className: "tv-overlay tv-sim-overlay", onMouseDown: function(e) {
        if (e.target === e.currentTarget) setCaseSimOpen(false);
      } }, /* @__PURE__ */ React.createElement("div", { className: "tv-modal tv-sim-loading-modal", onMouseDown: function(e) {
        e.stopPropagation();
      } }, /* @__PURE__ */ React.createElement("div", { className: "tv-modal-hdr" }, /* @__PURE__ */ React.createElement("h3", null, "Case Opening Simulator"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "tv-modal-x", onClick: function() {
        setCaseSimOpen(false);
      } }, "X")), /* @__PURE__ */ React.createElement("p", { className: "tv-modal-item" }, ITEM_DETAILS.title), /* @__PURE__ */ React.createElement("p", { className: "tv-sim-status" }, caseSimError || (!CaseSimulator ? "Simulator script failed to load." : "Loading container contents…")))) : null, caseSimOpen && !caseSimLoading && caseSimConfig && isTerminal && TerminalSimulator ? /* @__PURE__ */ React.createElement(
        TerminalSimulator,
        {
          config: { title: caseSimConfig.title, image: caseSimConfig.image, items: containerContentsCards },
          terminalPrice: caseSimOpenCost,
          openLabel: "Reveal Offers",
          onClose: function() {
            setCaseSimOpen(false);
          },
          inline: false
        }
      ) : null, caseSimOpen && !caseSimLoading && caseSimConfig && !isTerminal && CaseSimulator ? /* @__PURE__ */ React.createElement(
        CaseSimulator,
        {
          config: caseSimConfig,
          pricedItems: caseSimConfig.items,
          caseOpenCost: caseSimOpenCost,
          equalWeight: caseSimEqualWeight,
          openLabel: looksLikeCapsuleContainer(ITEM_DETAILS.title, visualType) || /\b(package|parcel)\b/i.test(ITEM_DETAILS.title) ? "Open" : "Open Case",
          onClose: function() {
            setCaseSimOpen(false);
          },
          inline: false
        }
      ) : null);
    }
    (function() {
      var rootNode = document.getElementById("root");
      if (!rootNode) return;
      ReactDOM.render(/* @__PURE__ */ React.createElement(ItemPage, null), rootNode);
    })();
  })();
})();
