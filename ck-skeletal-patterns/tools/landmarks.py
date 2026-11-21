# Prints mid-sagittal profiles of the exported skull used to place S, N, A, B, Pog, Me, Go, Co
# and the incisor/molar reference points in src/morph.js (LM). usage: python3 tools/landmarks.py
import json, numpy as np
H=json.load(open("assets/skull.json")); raw=open("assets/skull.bin","rb").read()
c=H["chunks"][0]; P=np.frombuffer(raw[c["offset"]:c["offset"]+c["bytes"]],np.float32).reshape(-1,3)
ob={o[0]:o for o in H["objects"]}
def verts(n): _,_,b,nv=ob[n]; return P[b:b+nv]
S=verts("Sphenoid bone"); m=S[np.abs(S[:,0])<4]
for z in range(10,60,2):
    s=m[(m[:,2]>=z)&(m[:,2]<z+2)]
    if len(s): print(z, " ".join(f"{y:.0f}" for y in sorted(s[:,1])[::-1][:12]))
print("--- nasal bones midline")
Nb=np.concatenate([verts("Nasal bone.l"),verts("Nasal bone.r")]); m=Nb[np.abs(Nb[:,0])<3]
i=np.argmax(m[:,1]); print("top of nasal bones", m[i])
F=verts("Frontal bone"); f=F[(np.abs(F[:,0])<2)&(F[:,1]>-5)&(F[:,1]<15)]
for y in range(-4,16,2):
    s=f[(f[:,1]>=y)&(f[:,1]<y+2)]
    if len(s): print("frontal y",y,"max z",s[:,2].max().round(1))
print("--- maxilla midline anterior profile")
M=np.concatenate([verts("Maxilla.l"),verts("Maxilla.r")]); m=M[np.abs(M[:,0])<3]
for y in range(-62,-38,2):
    s=m[(m[:,1]>=y)&(m[:,1]<y+2)]
    if len(s): print("max y",y,"max z",s[:,2].max().round(1))
print("--- mandible")
D=verts("Mandible"); m=D[np.abs(D[:,0])<3]
for y in range(-108,-74,2):
    s=m[(m[:,1]>=y)&(m[:,1]<y+2)]
    if len(s): print("mand y",y,"max z",s[:,2].max().round(1), "min z", s[:,2].min().round(1))
i=np.argmin(m[:,1]); print("menton",m[i])
# gonion: most posterior-inferior point along the bisector in lateral projection
side=D[D[:,0]<-20]
k=np.argmax(-side[:,2]*0.70-side[:,1]*0.71); print("gonion (bisector)",side[k])
# condylion: most superior point of mandible
k=np.argmax(D[:,1]); print("highest mandible pt",D[k])
cond=D[(D[:,2]<20)]; k=np.argmax(cond[:,1]); print("condylion",cond[k])
print("ramus posterior border:")
for y in range(-90,-25,5):
    s=D[(D[:,1]>=y)&(D[:,1]<y+5)&(D[:,0]<0)]
    if len(s): print(y, s[:,2].min().round(1))
print("inferior border:")
for z in range(10,90,10):
    s=D[(D[:,2]>=z)&(D[:,2]<z+5)&(D[:,0]<0)]
    if len(s): print(z, s[:,1].min().round(1))
for t in ["Upper medial incisor.l","Lower medial incisor.l","Upper first molar tooth.l","Lower first molar tooth.l","Upper second molar tooth.l","Lower second molar tooth.l"]:
    V=verts(t); print(t, "tip/lowest" , V[np.argmin(V[:,1])].round(1) if t.startswith("Upper") else V[np.argmax(V[:,1])].round(1), "zrange", V[:,2].min().round(1), V[:,2].max().round(1))
