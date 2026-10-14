import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('stamina_update', Path(__file__).resolve().parents[1] / 'scripts' / 'update-stamina-data.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)

def fixture():
    sections = []
    for mode in ('No Buff', 'Max 15% Buff'):
        sections.append(f'<h2>Stamina Regeneration ({mode})</h2>')
        for alias in updater.ALIASES:
            durations = ['2:20m', '3:10m'] if mode == 'No Buff' else ['1:59m', '2:42m']
            if alias == 'Ptera':
                durations[1] = '3:10m(5:20m Latched)' if mode == 'No Buff' else '2:42m(4:32m Latched)'
            if alias == 'TRex':
                durations += ['4:15m', '3:20m', '2:05m']
            sections.append('<p>' + ' | '.join([alias, *durations]) + '</p>')
    sections.append('<h2>Stamina Regeneration (Not Resting)</h2>')
    for name, normal, buff in [('Standing','5m35s','4m45s'),('Walking','4m10s','3m33s'),('Trotting','2m50s','2m25s')]:
        sections.extend([f'<h3>{name}</h3>',f'<p>{normal}</p>',f'<p>Buffed: {buff}</p>'])
    return ''.join(sections)

class ParserTests(unittest.TestCase):
    def test_duration_and_recovery_columns_and_exceptions(self):
        data = updater.parse_timings(fixture())
        self.assertEqual(len(data),21)
        self.assertEqual(data['Carnotaurus']['duration'],'2:20m')
        self.assertEqual(data['Carnotaurus']['resting'],['3:10m','2:42m'])
        self.assertEqual(data['Carnotaurus']['standing'],['5:35m','4:45m'])
        self.assertEqual(data['Tyrannosaurus']['standing'],['4:15m','4:15m'])
        self.assertEqual(data['Pteranodon']['resting'][0],'3:10m(5:20mLatched)')

    def test_missing_duplicate_or_changed_columns_are_rejected(self):
        html = fixture()
        for invalid in [html.replace('<p>Carno | 2:20m | 3:10m</p>',''),html.replace('<p>Carno | 2:20m | 3:10m</p>','<p>Carno | 2:20m | 3:10m</p>'*2),html.replace('Carno | 2:20m | 3:10m','Carno | 2:20m'),html.replace('5m35s','5m75s')]:
            with self.assertRaises(ValueError):
                updater.parse_timings(invalid)

    def test_invalid_seconds_and_markup_are_rejected(self):
        for value in ('2:60m','unknown','2m<script>'):
            with self.assertRaises(ValueError):
                updater.timer(value)

if __name__ == '__main__':
    unittest.main()
