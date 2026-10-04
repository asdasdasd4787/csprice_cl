<?php
$c = curl_init('https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=5&start=0');
curl_setopt($c, CURLOPT_RETURNTRANSFER, true);
curl_setopt($c, CURLOPT_TIMEOUT, 30);
curl_setopt($c, CURLOPT_USERAGENT, 'Mozilla/5.0');
$b = curl_exec($c);
file_put_contents(__DIR__ . '/probe-out.txt', "err=" . curl_error($c) . "\nbody=" . substr((string)$b, 0, 200));
