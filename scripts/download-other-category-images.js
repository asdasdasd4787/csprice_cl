/**
 * Download Other-category card and collection images.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const OUT_DIR = path.join(__dirname, "..", "assets", "other");

const DOWNLOADS = {
  "charm-dr-boom.webp": "https://cdn.csroi.com/keychains/drboom/kc_db_lighter_png.png",
  "charm-missing-link-community.webp": "https://cdn.csroi.com/keychains/missinglink_community_01/kc_missinglink_muteghost_png.png",
  "charm-missing-link.webp": "https://cdn.csroi.com/keychains/missinglink/kc_missinglink_howl_png.png",
  "charm-small-arms.webp": "https://cdn.csroi.com/keychains/weapon_1/kc_wpn_tknife_gold_png.png",
  "music-kit-masterminds.webp": "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXU5A1PIYQNqhpOSV-fRPasw8rsXkhnLAdcv66aJgZzx_bafDRM6M-Jl4GbhOL4NvXUl2kHucAm2e_Hpoqs2QS2-0dsMWyhIdTBdVBrM1CBqwe2xO7mhZC_ot2XnkAgTm7F/256fx256f",
  "music-kit-initiators.webp": "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXU5A1PIYQNqhpOSV-fRPasw8rsXkhnLAdcv66aIglpx_rJZTJQ_-O1lZCYgvvxfb7Szm0HsZxy2L7C9o2i31bjqEI_Mjj7J4HBcgNoaQrUrlS8kO2605Ci_MOeCpuM9f0/256fx256f",
  "music-kit-deluge.webp": "https://cdn.csroi.com/weapon_cases/crate_musickit_deluge_capsule_png.png",
  "music-kit-nightmode.webp": "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXU5A1PIYQNqhpOSV-fRPasw8rsXkhnLAdcv66aJQ5n2-fFfjlH09-3hJOem_K6a-rVxT0DsMMi3uiYodul3Abj-RZla2H7J4KSdlI-NFGC-lS2ye65hYj84srnf02DzQ/256fx256f",
  "music-kit-tacticians.webp": "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXU5A1PIYQNqhpOSV-fRPasw8rsXkhnLAdcv66aPwZjx_rLeDxM_-O1lZCYgvvxfezXl2gI7JZ1jOzH8Nz0jlK2r0c-Mm-lLdLHdgVqMA2E-lO2x-7mjJai_MOeVWcaEqQ/256fx256f",
  "music-kit-masterminds-2.webp": "https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXU5A1PIYQNqhpOSV-fRPasw8rsXkhnLAdcv66aJgZzx_bafDRM6M_kq4OKh-ThP76fwmoI6pUij7_CoY3wjFfh-Es5Y2yhJdWQe1Q8YVnR-1S3kO7ugpO67oOJlyXVgKphwg/360fx360f",
  "patch-csgo-card.webp": "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXU5A1PIYQNqhpOSV-fRPasw8rsQ1xgJgxoprumIFcxnaKeIGpGvYjnzYbbwvOkMriBlDxSu5Z10ryS89-h3Azt-xVoY2nwJIaLMlhpqHx2GCs/256fx256f",
  "patch-csgo.webp": "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXU5A1PIYQNqhpOSV-fRPasw8rsQ1xgJgxoprumIFcxnaKeIGpGvYjnzYbbwvOkMriBlDxSu5Z10ryS89-h3Azt-xVoY2nwJIaLMlhpqHx2GCs/256fx256f",
  "patch-alyx.webp": "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXU5A1PIYQNqhpOSV-fRPasw8rsQ1xgJgxoprumIDho3_LEaCUMuY_vkILbwfX3ZuPUwzsGsZIiibiSporz21HnrxE6aziiJoKUelA_N0aQpAZKASuIOw/256fx256f",
  "patch-stockholm-challengers.webp": "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXU5A1PIYQNqhpOSV-fRPasw8rsQ1xgJgxoprumIDhzx_zLejUQvI7nq4ODlvv4NrXWk3lC18lwmO7Eu9Sh2wTt_BJlamjyIIHEIwU7Y1qGrlfsxrzvg8O_uZ7KmCBm7ykk7HfD30vgKWgrjwY/256fx256f",
  "patch-stockholm-contenders.webp": "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXU5A1PIYQNqhpOSV-fRPasw8rsQ1xgJgxoprumIDhzx_zLejUQvI7nq4OEmePxPb_UhHhu5MRjjeyPpdXxjgXm_0Y_azundofDcwJsZAyF-APqlbjojJ_v6p7Ny3Vn6CR07WGdwUJ4XOuu1w/256fx256f",
  "patch-stockholm-legends.webp": "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXU5A1PIYQNqhpOSV-fRPasw8rsQ1xgJgxoprumIDhzx_zLejUQvI7nq4yOkPL6N6jummpD78A_jLyWptWk3Fbm_RFkYGH6IoSUJwM8YlmEqFi7lezqg5K0us6czSRk7j5iuyjxavw9ZA/256fx256f",
  "patch-riptide.webp": "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXT4BhcJo8h5hhcX0nvSPT8hoDDUkl3LTtYpuv0FAFy3PT3YjZH4Nmim460m_bmNL6fx2gG6ZIpjrmWpI-l3Vbm_BY9YW_zcoHAdlJsMFvW-1Ptxubqg5butYOJlyW34Y3k9w/256fx192f",
  "patch-metal-skill-group.webp": "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXT4BhcJo8h5hhcX0nvVO-k28PUQVJhNRcYpruxKA9fwPrEZzhQ09izmY-FqPv1IbzU2DgB68Z13bmQ8YmnjgexrxA5MDuid4WSeg9sYVyBrgLrlbvv05O1u5zXiSw0YRp3Ono/256fx192f",
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    client
      .get(url, { headers: { "User-Agent": "CS2PriceTracker/1.0" } }, (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          download(response.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          fs.writeFileSync(dest, Buffer.concat(chunks));
          resolve(dest);
        });
      })
      .on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [file, url] of Object.entries(DOWNLOADS)) {
    const dest = path.join(OUT_DIR, file);
    await download(url, dest);
    console.log(`saved ${file} (${fs.statSync(dest).size} bytes)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
