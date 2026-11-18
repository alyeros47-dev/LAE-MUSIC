#!/usr/bin/env python3
"""Read public catalogue metadata only. Never writes to the website or guesses song content."""
import collections, datetime, json, pathlib, urllib.parse, urllib.request
out=pathlib.Path(__file__).resolve().parents[1]/'release'
tracks={}; cursor=None
for page in range(100):
    query=urllib.parse.urlencode({'limit':50,**({'cursor':cursor} if cursor else {})})
    request=urllib.request.Request('https://lae-music.com/api/platform/discover?'+query,headers={'User-Agent':'LAE-MUSIC-release-metadata-review/1.0'})
    with urllib.request.urlopen(request,timeout=30) as response: data=json.load(response)
    for song in data.get('tracks',[]): tracks[str(song['id'])]=song
    cursor=data.get('next_cursor')
    if not cursor: break
else: raise RuntimeError('Catalogue pagination exceeded review limit; no completeness claim permitted')
# Keep only public metadata needed for the owner's classification review.
fields=('id','title','artist','artist_id','genre','music_family','gospel_categories')
rows=[{k:s[k] for k in fields if k in s} for s in tracks.values()]
report={'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'public_songs':len(rows),'genre_counts':dict(collections.Counter(s.get('genre','') for s in rows)),'missing_explicit_family':sum(not s.get('music_family') for s in rows),'missing_explicit_categories':sum(not s.get('gospel_categories') for s in rows),'songs':rows}
(out/'catalogue-metadata-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='songs'},indent=2))
