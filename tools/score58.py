"""Synthesize the deterministic original score for the 58-second demo."""
from pathlib import Path
import argparse
import math
import numpy as np
import soundfile as sf
from scipy import signal

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[1]
parser = argparse.ArgumentParser(description="Synthesize the original 58-second stereo score.")
parser.add_argument("--output", type=Path, default=ROOT / "build" / "score58-premaster.wav")
parser.add_argument("--hits", nargs=3, type=float, default=[32.24, 36.64, 40.64],
                    metavar=("GRAY", "GOLD", "VIOLET"))
args = parser.parse_args()
output = args.output.resolve()
output.parent.mkdir(parents=True, exist_ok=True)
sr, seconds = 48000, 58
n = sr * seconds
rng = np.random.default_rng(581104)
tau = 2*math.pi
buf = np.zeros((n,2),dtype=np.float32)
room = np.zeros_like(buf)
time = np.arange(n,dtype=np.float64)/sr

def clock(length):
    return np.arange(int(length*sr),dtype=np.float64)/sr

def hz(midi):
    return 440*2**((midi-69)/12)

def rise(x):
    x=np.clip(x,0,1)
    return x*x*(3-2*x)

def add(start, wave, pan=0, send=.20):
    i=int(round(start*sr))
    if i>=n: return
    wave=wave[:n-i]
    if wave.ndim==1:
        angle=(np.clip(pan,-1,1)+1)*math.pi/4
        wave=np.column_stack((wave*np.cos(angle),wave*np.sin(angle)))
    buf[i:i+len(wave)]+=wave
    room[i:i+len(wave)]+=send*wave

def filter_noise(length, lo, hi):
    noise=rng.standard_normal(length)
    sos=signal.butter(2,[lo,hi],btype='bandpass',fs=sr,output='sos')
    x=signal.sosfilt(sos,noise)
    return x/(np.sqrt(np.mean(x*x))+1e-12)

def key(start,note,vel=.60,pan=0,kind='felt'):
    f=hz(note)
    if kind=='glass':
        t=clock(3.4)
        # Two struck glass modes split by a few cents; the higher modes die away first.
        x=np.zeros_like(t)
        for multiple,weight,decay in [(1,.65,1.0),(2.002,.15,.78),(2.706,.095,.50),(4.13,.046,.29),(5.42,.021,.24)]:
            phase=rng.uniform(0,tau)
            x+=weight*np.exp(-t/decay)*(.78*np.sin(tau*f*multiple*t+phase)+.22*np.sin(tau*f*multiple*1.0024*t+phase))
        x*=rise(t/.018)*rise((3.4-t)/.50)
        add(start,x*.073*vel,pan,.59)
    else:
        t=clock(3.5)
        x=np.zeros_like(t)
        for k,w in enumerate([1,.41,.30,.12,.077,.035,.024],1):
            phase=rng.uniform(-.45,.45)
            decay=(.97 if k==1 else .88/(k**.63))*(1.05 if note<63 else .86)
            ph=tau*f*k*(1+.000048*k*k)*t
            x+=w*np.exp(-t/decay)*(.68*np.sin(ph+phase)+.32*np.sin(ph*1.0017+phase))
        touch=filter_noise(len(t),520,2400)*np.exp(-t/.011)*.027
        x=(x+touch)*rise(t/.008)*rise((3.5-t)/.3)
        add(start,x*.105*vel,pan,.29)

def bass(start,note,amp,length):
    f=hz(note); t=clock(length)
    env=rise(t/.065)*rise((length-t)/min(.48,length*.52))*np.exp(-t/(length*1.25))
    x=np.sin(tau*f*t)+.32*np.sin(tau*2*f*t+.08)+.10*np.sin(tau*3*f*t+.4)
    add(start,.083*amp*x*env,0,.07)

def pad(start,notes,length,level,width):
    t=clock(length); x=np.zeros((len(t),2))
    for j,note in enumerate(notes):
        f=hz(note)
        a=rng.uniform(0,tau)
        env=rise((t-.035*j)/(.65+.10*j))*rise((length-t)/1.00)
        for ch,detune in enumerate([-.00165,.00191]):
            ph=tau*f*(1+detune*(1+.12*j))*t+a
            ph+=.20*np.sin(tau*(.22+.018*j)*t+a+ch*.32)
            body=np.sin(ph)+.30*np.sin(2*ph+.25*j)+.14*np.sin(3*ph+.37)+.050*np.sin(5*ph+.42)
            x[:,ch]+=body*env*(.93+.07*np.cos(tau*.18*t+a))*([1,.81,.75,.57][j])
    mid=x.mean(axis=1); x=mid[:,None]+width*(x-mid[:,None])
    add(start,x*.024*level,send=.34)

# D major colours with sustained seconds, open fifths and one unresolved A pedal.
# Chords overlap, allowing the lunar and stellar timbres to grow out of the ground.
chords=[
 (0,[50,57,64,69],4.65,.42,.34), (3.8,[50,57,62,66],4.9,.54,.42),
 (7.8,[47,54,62,64],5.0,.67,.52), (11.8,[43,57,62,66],4.9,.76,.67),
 (15.8,[42,57,61,66],4.9,.89,.78), (19.8,[40,55,59,66],4.9,.91,1.0),
 (23.8,[43,57,62,66],4.9,.76,.83), (27.8,[45,52,59,62],4.9,.61,.60),
 (31.8,[47,54,62,64],4.9,.74,.82), (35.8,[43,54,59,61],4.9,.85,.93),
 (39.8,[42,57,61,64],5.0,.99,1.02), (43.8,[40,55,59,66],4.9,.76,.80),
 (47.8,[45,55,59,62],4.9,.66,.60), (51.8,[50,57,61,64],6.1,.50,.48)]
for data in chords: pad(*data)

# Filtered air and two deep, gently bowed harmonics give Terra a physical horizon.
air=filter_noise(n,115,580)
air2=filter_noise(n,470,1480)
land=rise((time-.3)/2.8)*(1-rise((time-9.2)/5.0))
for ch,delay in enumerate([0,531]):
    gust=.56+.21*np.sin(tau*.14*time+.4)+.15*np.sin(tau*.27*time)
    buf[:,ch]+=(.010*np.roll(air,delay)+.0037*np.roll(air2,delay//3))*land*gust
for start,note,amp,dur in [(1.1,38,.47,2.9),(4.1,38,.66,2.8),(7.25,35,.68,3.1),(11.0,43,.55,2.7),
 (14.15,38,.52,2.0),(16.5,42,.70,3.45),(20.48,40,.72,3.2),(24.50,43,.48,2.88),
 (28.42,45,.42,2.75),(32,35,.60,3.55),(36,43,.70,3.55),(40,42,.75,3.55),
 (44.6,40,.58,2.7),(48.15,45,.57,3.30),(52.2,38,.60,3.50)]: bass(start,note,amp,dur)

# An open D–A–E question returns as E–A–D during the reverse drag.
lead=[(.36,62,.74,-.13),(1.40,69,.48,.04),(2.68,76,.42,.18),(4.57,62,.50,-.21),
 (5.92,66,.45,.03),(7.18,69,.42,-.13),(8.55,74,.55,.02),(10.40,62,.69,-.18),
 (11.80,69,.60,.03),(13.18,76,.65,.26),(14.54,73,.42,-.13),(15.90,78,.61,.15),
 (16.62,76,.4,-.1),(18.28,74,.51,.18),(20.48,71,.58,-.20),(22.10,78,.38,.25),
 (24.08,76,.63,.20),(25.06,69,.61,.00),(25.95,62,.64,-.20),(27.47,69,.45,-.13),
 (28.82,71,.44,.09),(30.72,64,.56,-.06),(33.88,74,.46,.05),(35.18,69,.43,-.16),
 (37.91,73,.53,.16),(39.16,71,.40,-.18),(42.03,78,.56,.18),(43.52,76,.46,-.10),
 (45.31,71,.45,-.16),(47.20,74,.46,.09),(49.05,73,.44,-.11),(50.47,69,.41,.08),
 (52.48,66,.54,-.12),(53.83,64,.55,.13),(55.20,62,.70,-.03)]
for e in lead:key(*e)

# A broken six-beat pattern, expressed through differently placed notes rather than drum clicks.
beat=2/3
for bar,root,upper in [(0,50,57),(1,50,57),(2,47,54),(3,43,55),(4,42,57),(5,40,55),
 (6,43,55),(7,45,57),(8,47,54),(9,43,55),(10,42,57),(11,40,55),(12,45,57)]:
    for off,pitch,vel,stereo in [(0,root,.49,-.17),(1.5,upper,.34,.14),(3.5,root+12,.30,-.10),(5,upper,.32,.19)]:
        if bar==0 and off<3 or bar==7 and off in (3.5,5):continue
        gain=.75 if bar<2 or bar>=11 else 1.0
        key(.18+4*bar+off*beat,pitch,vel*gain,stereo)

stars=[
 (9.0,81,.45,-.32),(12.66,78,.62,-.42),(13.37,83,.36,.42),(14.98,81,.45,.16),
 (16.13,85,.61,.36),(17.29,81,.33,-.30),(18.75,86,.54,.52),(19.46,81,.30,-.42),
 (20.24,83,.42,.14),(21.68,90,.40,-.52),(23.15,85,.28,.50),
 (24.3,85,.37,.42),(25.17,81,.32,.07),(26.00,78,.44,-.40),(29.65,76,.26,.21),
 (33.10,81,.40,-.26),(34.42,78,.27,.34),(37.44,85,.50,.42),(38.69,81,.38,-.45),
 (41.32,88,.55,-.45),(41.98,85,.37,.48),(42.62,81,.32,-.16),
 (44.10,83,.43,-.66),(44.58,85,.34,.51),(46.67,81,.37,-.50),(47.23,78,.28,.48),
 (49.7,83,.35,.42),(52.80,81,.38,-.35),(54.12,78,.34,.39),(55.59,74,.48,.08)]
for start,note,vel,pan in stars:key(start,note,vel,pan,'glass')

# Slowly bowed upper partials are the distant answer to the dry opening keys.
# The suspended G-sharp against D appears once before resolving a semitone up.
for start,note,length,gain,pan in [(12.30,80,1.65,.52,-.34),(14.12,81,2.20,.42,.47),
                                   (20.45,78,2.80,.65,-.52),(23.05,76,2.05,.45,.37),
                                   (36.93,73,1.95,.36,-.26),(40.92,76,2.30,.44,.39)]:
    t=clock(length)
    env=rise(t/(length*.48))*rise((length-t)/(length*.42))
    ph=tau*hz(note)*t+.31*np.sin(tau*3.1*t)
    bow=(np.sin(ph)+.30*np.sin(2.008*ph)+.15*np.sin(3.002*ph))*.022
    add(start,bow*env*gain,pan,.67)

# The three Bel activations share one resonant gesture. A brief inhale leads the wave.
for j,(hit,note) in enumerate(zip(args.hits,[35,31,30])):
    t=clock(1.65); f=hz(note)
    env=rise(t/.072)*np.exp(-t/.38)*rise((1.65-t)/.38)
    phase=tau*f*(t+.013*(1-np.exp(-t/.095)))
    x=env*(np.sin(phase)+.43*np.sin(2*phase+.1)+.16*np.sin(3*phase+.22))
    add(hit,x*[.105,.137,.171][j],send=.18)
    t=clock(.67); breath=filter_noise(len(t),310+100*j,1500+350*j)
    env=rise(t/.62)**2*rise((.67-t)/.065)
    add(hit-.61,breath*env*(.017+.003*j),(-1)**j*.22,.48)

# A diffuse stereo chamber, with separate decorrelated reflections and damped high frequencies.
for ch in range(2):
    t=clock(2.35); hiss=rng.standard_normal(len(t))
    early=signal.sosfilt(signal.butter(2,5300,btype='lowpass',fs=sr,output='sos'),hiss)
    late=signal.sosfilt(signal.butter(2,1850,btype='lowpass',fs=sr,output='sos'),hiss)
    ir=(early*np.exp(-t/.145)+late*np.exp(-t/.385)) * rise((t-.022)/.048)
    ir *= .40/np.sqrt(np.sum(ir*ir))
    for secs,gain in [(.029,.18),(.046,.118),(.075,.09),(.130,.054)]:
        ir[int((secs+ch*.0043)*sr)]+=gain
    wet=signal.oaconvolve(room[:,ch],ir,mode='full')[:n]
    buf[:,ch]+=wet
buf=signal.sosfilt(signal.butter(2,27,btype='highpass',fs=sr,output='sos'),buf,axis=0)
buf*=rise(time/.10)[:,None]*(1-rise((time-56.05)/1.94))[:,None]
sf.write(output,buf,sr,subtype='PCM_24')
print(f'{output}: {seconds}s stereo {sr}Hz PCM_24, raw peak {np.max(np.abs(buf)):.4f}')
