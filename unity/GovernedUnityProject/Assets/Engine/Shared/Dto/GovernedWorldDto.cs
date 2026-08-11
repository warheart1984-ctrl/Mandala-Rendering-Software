// Canonical Governed World DTO — Unity/Unreal deserialize from the same JSON.

// Status: shared contract. Browser uses demo/worlds/*.world.json directly.



using System;

using System.Collections.Generic;



namespace SovereignX.CIEMS.Engine.Dto

{

    [Serializable]

    public class GovernedWorldDto

    {

        public string id;

        public string name;

        public string constitution;

        public List<GovernedAssetDto> assets = new List<GovernedAssetDto>();

        public List<GovernedEntityDto> entities = new List<GovernedEntityDto>();

        public List<string> timelines = new List<string>();

        public List<string> contracts = new List<string>();

    }



    [Serializable]

    public class GovernedAssetDto

    {

        public string id;

        public string type;

        public string uri;

        public List<string> evidence = new List<string>();

    }



    [Serializable]

    public class GovernedEntityDto

    {

        public string id;

        public string name;

        public string parent;

        public List<GovernedComponentDto> components = new List<GovernedComponentDto>();

    }



    [Serializable]

    public class GovernedComponentDto

    {

        public string type;

        // JsonUtility cannot map Dictionary; hosts parse config via companion helpers or Newtonsoft.

        public string configJson;

    }

}

