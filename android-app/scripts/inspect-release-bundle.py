#!/usr/bin/env python3
"""Inspect the built bundle, including transitive native libraries. No signing or upload."""
import hashlib,json,pathlib,struct,sys,zipfile
path=pathlib.Path(sys.argv[1]); libraries=[]
with zipfile.ZipFile(path) as bundle:
    names=bundle.namelist()
    for required in ('BundleConfig.pb','base/manifest/AndroidManifest.xml','base/dex/classes.dex'):
        assert required in names, f'Missing bundle entry: {required}'
    assert not any(n.lower().endswith(('.jks','.keystore')) for n in names),'Private key in bundle'
    for name in names:
        if not name.endswith('.so'): continue
        b=bundle.read(name);assert b[:4]==b'\x7fELF','Not an ELF library'
        assert b[5]==1,'Review non-little-endian ELF explicitly'
        wide=b[4]==2
        offset=struct.unpack_from('<Q' if wide else '<I',b,32 if wide else 28)[0]
        size,count=struct.unpack_from('<HH',b,54 if wide else 42)
        aligns=[]
        for index in range(count):
            start=offset+index*size
            if struct.unpack_from('<I',b,start)[0]!=1: continue
            alignment=struct.unpack_from('<Q' if wide else '<I',b,start+(48 if wide else 28))[0]
            aligns.append(alignment)
            if wide: assert alignment>=16384 and alignment%16384==0,f'{name}: non-16KB LOAD alignment'
        assert aligns,'No loadable segments'
        libraries.append({'file':name,'bits':64 if wide else 32,'load_segment_alignment':aligns})
    signed=any(n.startswith('META-INF/') and n.endswith(('.RSA','.DSA','.EC')) for n in names)
print(json.dumps({'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'signed':signed,'native_libraries':libraries},indent=2))
