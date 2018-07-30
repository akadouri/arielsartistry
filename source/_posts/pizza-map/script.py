import psycopg2
import csv

conn = psycopg2.connect("dbname=routing user=ariel")
cur = conn.cursor()

way_osm_id = 195743190
cur.execute("SELECT source FROM ways WHERE osm_id = %s", (way_osm_id,))
source = cur.fetchone()[0]
print("My source: " + str(source))

cur.execute("SELECT * FROM osm_nodes WHERE tag_value = 'pizza'")
osm_ids = []
for record in cur:
    osm_ids.append(record[0])
    
print("We're going to route to: " + str(len(osm_ids)) + " pizza nodes.")


osm_ids_streets = []
for osm_id in osm_ids:
    cur.execute("SELECT source\
        FROM ways\
        ORDER BY ways.the_geom <-> (SELECT the_geom FROM osm_nodes WHERE osm_id = %s limit 10) limit 1;", (osm_id,))
    osm_ids_streets.append(cur.fetchone()[0])

print("We've got: " + str(len(osm_ids_streets)) + " nearest streets. Should be the same number as pizza nodes.")


def writeRoute(route):
    print("writing route of length: " + str(len(route)))
    with open('routes.csv', 'a') as f:
        writer = csv.writer(f, lineterminator='\n')
        for r in route:
            writer.writerow(r)

for osm_id in osm_ids_streets:
    cur.execute("select ST_AsText(the_geom), agg_cost from (SELECT * FROM pgr_dijkstra('\
        SELECT gid as id, source, target, length as cost\
        FROM ways',\
        %s, %s, false)) as x, ways where x.edge = ways.gid;", (source, osm_id,));
    writeRoute(cur.fetchall())
