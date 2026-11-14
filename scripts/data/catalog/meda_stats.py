import csv,sys,glob,json,os
D=sys.argv[1]; out={}
for s in ['0502','0504','0509','0516']:
    r={}
    f=glob.glob(f'{D}/WE__{s}*CAL_ATS*.CSV')[0]
    vals=[]
    for row in csv.DictReader(open(f)):
        try: v=[float(row[f'ATS_LOCAL_TEMP{i}']) for i in (1,2,3)]
        except: continue
        vals.append((sum(v)/3,row['LMST']))
    mn=min(vals); mx=max(vals); r['ats']={'n':len(vals),'min':mn,'max':mx,'first':vals[0][1],'last':vals[-1][1]}
    f=glob.glob(f'{D}/WE__{s}*CAL_PS*.CSV')[0]
    vals=[]; modes=set()
    for row in csv.DictReader(open(f)):
        modes.add((row['PRESSURE_MEASUREMENT_MODE'],row['TRANSDUCER']))
        try: vals.append((float(row['BAROCAP1_PRESSURE']),row['LMST']))
        except: pass
    r['ps']={'n':len(vals),'min':min(vals),'max':max(vals),'modes':sorted(modes),'first':vals[0][1],'last':vals[-1][1]}
    out[s]=r
print(json.dumps(out,indent=1))
