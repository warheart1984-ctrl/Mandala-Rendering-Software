// Unity world loader — InstantiateWorld from GovernedWorldDto.

// Status: skeleton until Play Mode verifies spawn/parent/components.



using System;

using System.Collections.Generic;

using System.Globalization;

using System.IO;

using SovereignX.CIEMS.Engine.Dto;

using UnityEngine;



namespace SovereignX.CIEMS.Engine.World

{

    public static class GovernedWorldLoader

    {

        public static GovernedWorldDto LoadFromFile(string path)

        {

            var json = File.ReadAllText(path);

            return JsonUtility.FromJson<GovernedWorldDto>(json);

        }



        public static void InstantiateWorld(GovernedWorldDto world)

        {

            if (world?.entities == null) return;



            var idToGo = new Dictionary<string, GameObject>();



            foreach (var entity in world.entities)

            {

                var go = new GameObject(string.IsNullOrEmpty(entity.name) ? entity.id : entity.name);

                idToGo[entity.id] = go;

            }



            foreach (var entity in world.entities)

            {

                if (!string.IsNullOrEmpty(entity.parent) &&

                    idToGo.TryGetValue(entity.parent, out var parent) &&

                    idToGo.TryGetValue(entity.id, out var child))

                {

                    child.transform.SetParent(parent.transform, true);

                }

            }



            foreach (var entity in world.entities)

            {

                if (!idToGo.TryGetValue(entity.id, out var go) || entity.components == null) continue;

                foreach (var comp in entity.components)

                    AttachComponent(go, comp);

            }

        }



        static void AttachComponent(GameObject go, GovernedComponentDto comp)

        {

            if (comp == null || string.IsNullOrEmpty(comp.type)) return;

            var cfg = ParseConfig(comp.configJson);



            switch (comp.type)

            {

                case "Transform":

                    ApplyTransform(go.transform, cfg);

                    break;

                case "Camera":

                    var cam = go.GetComponent<Camera>() ?? go.AddComponent<Camera>();

                    ApplyCamera(cam, cfg);

                    break;

                case "FourDRenderer":

                    var type = Type.GetType("GovernedEngine.Rendering.FourDTesseractRenderer, Assembly-CSharp")

                               ?? Type.GetType("FourDTesseractRenderer, Assembly-CSharp");

                    if (type == null) break;

                    var r = go.GetComponent(type) ?? go.AddComponent(type);

                    ApplyFourDFields(r, cfg);

                    break;

            }

        }



        static Dictionary<string, string> ParseConfig(string configJson)

        {

            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            if (string.IsNullOrEmpty(configJson)) return map;

            // Minimal key:"value" / key:number extraction for host bootstrap without Newtonsoft.

            // Full JSON objects should be pre-flattened into configJson as {"d4":2,"d3":5,"speed":1}.

            try

            {

                // Prefer JsonUtility wrapper when available in host project with a ConfigBag.

                var trimmed = configJson.Trim();

                if (trimmed.StartsWith("{"))

                {

                    // crude: "key": number|string

                    var parts = trimmed.Trim('{', '}').Split(',');

                    foreach (var part in parts)

                    {

                        var kv = part.Split(':');

                        if (kv.Length < 2) continue;

                        var key = kv[0].Trim().Trim('"');

                        var val = kv[1].Trim().Trim('"');

                        map[key] = val;

                    }

                }

            }

            catch { /* leave empty */ }

            return map;

        }



        static void ApplyTransform(Transform t, Dictionary<string, string> cfg)

        {

            if (cfg.TryGetValue("position.x", out var px) || cfg.TryGetValue("posX", out px))

            {

                var p = t.position;

                p.x = ToFloat(px);

                if (cfg.TryGetValue("position.y", out var py) || cfg.TryGetValue("posY", out py)) p.y = ToFloat(py);

                if (cfg.TryGetValue("position.z", out var pz) || cfg.TryGetValue("posZ", out pz)) p.z = ToFloat(pz);

                t.position = p;

            }

        }



        static void ApplyCamera(Camera cam, Dictionary<string, string> cfg)

        {

            if (cfg.TryGetValue("fov", out var fov))

                cam.fieldOfView = ToFloat(fov);

        }



        static void ApplyFourDFields(Component r, Dictionary<string, string> cfg)

        {

            var t = r.GetType();

            SetFloat(t, r, "d4", cfg, "d4");

            SetFloat(t, r, "d3", cfg, "d3");

            SetFloat(t, r, "speed", cfg, "speed");

        }



        static void SetFloat(Type t, object obj, string field, Dictionary<string, string> cfg, string key)

        {

            if (!cfg.TryGetValue(key, out var s)) return;

            var f = t.GetField(field);

            if (f != null && f.FieldType == typeof(float))

                f.SetValue(obj, ToFloat(s));

        }



        static float ToFloat(string s) =>

            float.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : 0f;

    }

}

