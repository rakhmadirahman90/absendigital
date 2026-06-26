import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Clock, Calendar } from 'lucide-react';

interface RealTimeClockProps {
  className?: string;
  variant?: 'card' | 'banner' | 'compact';
}

export default function RealTimeClock({ className = '', variant = 'card' }: RealTimeClockProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = format(time, 'HH:mm:ss');
  const formattedDate = format(time, 'EEEE, d MMMM yyyy', { locale: id });

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200/80 shadow-sm text-slate-700 ${className}`}>
        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
          <Clock size={16} className="animate-pulse" />
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none mb-0.5">Waktu Server Lokal</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-bold text-slate-800 tracking-tight">{formattedTime}</span>
            <span className="text-[10px] text-slate-500 font-medium">{format(time, 'd MMM yyyy', { locale: id })}</span>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'banner') {
    return (
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl border border-blue-950 shadow-md relative overflow-hidden ${className}`}>
        {/* Decorative ambient background blur */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl -ml-8 -mb-8 pointer-events-none" />

        <div className="relative z-10 flex items-center gap-4">
          <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 shadow-inner">
            <Clock size={28} className="text-blue-300 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-blue-300/90">Waktu Presensi Akurat</span>
            <h4 className="text-sm font-medium text-slate-100">{formattedDate}</h4>
          </div>
        </div>

        <div className="relative z-10 bg-white/5 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-white/10 shadow-sm flex items-center justify-center">
          <span className="font-mono text-3xl md:text-4xl font-extrabold tracking-tight text-white drop-shadow-sm select-none">
            {formattedTime}
          </span>
        </div>
      </div>
    );
  }

  // Default 'card' variant
  return (
    <div className={`bg-white p-5 rounded-2xl border border-slate-200/85 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Clock size={16} className="animate-pulse" />
          </div>
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Jam Digital Real-time</span>
        </div>
        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
          <span>Sinkron</span>
        </span>
      </div>

      <div className="flex flex-col items-center justify-center py-2">
        <div className="font-mono text-4xl font-black text-slate-800 tracking-tight leading-none mb-2 hover:scale-[1.02] transition-transform cursor-default select-none">
          {formattedTime}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <Calendar size={13} className="text-slate-400" />
          <span>{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}
