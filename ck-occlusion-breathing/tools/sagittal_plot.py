# Midsagittal section plot of assets/head.glb (landmark measurement for the airway/adenoid fit).
# usage: python3 tools/sagittal_plot.py assets/head.glb out.png [x=0.0015]
import trimesh, numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt, sys
sc=trimesh.load(sys.argv[1])
fig,ax=plt.subplots(figsize=(12,14))
cols={'Tongue':'red','Soft_palate':'orange','Uvula':'orange','Nasopharynx':'blue','Oropharynx':'navy','Mucosa_of_nasal':'magenta','Skin':'peru','Genioglossus':'darkred','Epiglottis':'cyan','Gingiva':'pink','Hyoid':'green','Palatine_tonsil':'lime'}
X=float(sys.argv[3]) if len(sys.argv)>3 else 0.0015
for name,g in sc.geometry.items():
  try:
    T=sc.graph.get(name)
  except: pass
  m=g
  sec=m.section(plane_origin=[X,0,0],plane_normal=[1,0,0])
  if sec is None: continue
  c='gray'
  for k,v in cols.items():
    if k.replace('_',' ') in name or k in name: c=v
  if any(t in name for t in ['incisor','canine','premolar','molar']): c='goldenrod'
  for e in sec.discrete:
    ax.plot(e[:,2],e[:,1],color=c,lw=0.8)
ax.set_aspect('equal'); ax.grid(True,lw=0.3); ax.set_xticks(np.arange(-0.12,0.16,0.01)); ax.set_yticks(np.arange(-0.12,0.2,0.01)); ax.tick_params(labelsize=6)
plt.savefig(sys.argv[2],dpi=110,bbox_inches='tight')
print(list(sc.geometry.keys())[:5])
